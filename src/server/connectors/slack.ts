import { createHmac, timingSafeEqual } from "node:crypto";
import { WebClient } from "@slack/web-api";
import { env } from "../env";
import { connections } from "../db";
import { decryptJson, encryptJson, encryptString, decryptString, uid } from "../lib/crypto";
import { setConnectionStatus, upsertDestination } from "./store";
import { ingestMessage, type ChatKind } from "./ingest";

// users:read → real names instead of IDs; im/mpim → private and group DMs.
const SLACK_USER_SCOPES =
  "channels:read,channels:history,groups:read,groups:history,im:read,im:history,mpim:read,mpim:history,users:read,chat:write";

export function slackAuthUrl(userId: string): string {
  const state = encryptString(JSON.stringify({ userId, t: Date.now() }));
  const params = new URLSearchParams({
    client_id: env.slack.clientId,
    user_scope: SLACK_USER_SCOPES,
    redirect_uri: env.slack.redirectUri,
    state,
  });
  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

export function readState(state: string): { userId: string } {
  return JSON.parse(decryptString(state));
}

async function client(connectionId: string): Promise<WebClient> {
  const conn = await connections().findOne({ _id: connectionId });
  if (!conn?.encryptedCredentials) throw new Error("Slack is not connected");
  const { token } = decryptJson<{ token: string }>(conn.encryptedCredentials);
  return new WebClient(token);
}

// ---- Names ----
const nameCache = new Map<string, string>(); // `${connectionId}|${slackUserId}` → display name
const noNameScope = new Set<string>(); // connections whose token lacks users:read (reconnect grants it)
async function userName(slack: WebClient, connectionId: string, slackUserId?: string): Promise<string> {
  if (!slackUserId) return "Slack member";
  const key = `${connectionId}|${slackUserId}`;
  const hit = nameCache.get(key);
  if (hit) return hit;
  if (noNameScope.has(connectionId)) return slackUserId;
  try {
    const res: any = await slack.users.info({ user: slackUserId });
    const p = res?.user?.profile;
    const name = p?.display_name || p?.real_name || res?.user?.real_name || res?.user?.name || slackUserId;
    nameCache.set(key, name);
    return name;
  } catch (e) {
    if ((e as any)?.data?.error === "missing_scope") noNameScope.add(connectionId);
    else nameCache.set(key, slackUserId); // don't retry an unknown user on every message
    return slackUserId;
  }
}

function kindOf(conv: any): ChatKind {
  if (conv?.is_im) return "dm";
  if (conv?.is_mpim) return "group";
  return "channel";
}
async function convName(slack: WebClient, connectionId: string, conv: any): Promise<string> {
  if (conv?.is_im) return userName(slack, connectionId, conv.user);
  return conv?.name ? (conv.is_mpim ? conv.name : `#${conv.name}`) : conv?.id || "Slack chat";
}

export async function completeSlackOAuth(userId: string, code: string): Promise<string> {
  const exchange = new WebClient();
  const result: any = await exchange.oauth.v2.access({
    client_id: env.slack.clientId,
    client_secret: env.slack.clientSecret,
    code,
    redirect_uri: env.slack.redirectUri,
  });
  const token = result?.authed_user?.access_token;
  if (!token) throw new Error(result?.error || "Slack authorization failed");
  const teamId = result?.team?.id ?? null;
  const teamName = result?.team?.name ?? "Slack";

  const now = new Date();
  const existing = await connections().findOne({ userId, platform: "slack", externalId: teamId });
  const connectionId = existing?._id ?? uid();
  await connections().updateOne(
    { _id: connectionId },
    {
      $set: {
        userId,
        platform: "slack",
        status: "connected",
        displayName: teamName,
        externalId: teamId,
        slackUserId: result?.authed_user?.id ?? null,
        encryptedCredentials: encryptJson({ token }),
        lastError: null,
        heartbeatAt: now,
        syncedAt: null,
        updatedAt: now,
      },
      $setOnInsert: { _id: connectionId, createdAt: now },
    },
    { upsert: true },
  );
  syncSlack(connectionId).catch(() => undefined);
  return connectionId;
}

/**
 * Register the user's conversations and store recent messages. First run = backfill (no alerts);
 * later runs pick up anything since the last sync and DO trigger monitors/auto-replies, so this
 * doubles as the safety net when Slack's live events aren't configured.
 */
const syncing = new Set<string>();
export async function syncSlack(connectionId: string): Promise<void> {
  if (syncing.has(connectionId)) return;
  syncing.add(connectionId);
  try {
    const conn = await connections().findOne({ _id: connectionId, platform: "slack", status: "connected" });
    if (!conn) return;
    const slack = await client(connectionId);
    const firstSync = !conn.syncedAt;
    const oldestMs = Math.max(Date.now() - 14 * 24 * 60 * 60 * 1000, conn.syncedAt ? conn.syncedAt.getTime() - 120_000 : 0);
    const startedAt = new Date();

    // Connections authorized before private-message access was added lack im/mpim scopes:
    // fall back to channels only (reconnecting Slack grants the rest).
    const listConversations = async (types: string): Promise<any[]> => {
      let cursor: string | undefined;
      const out: any[] = [];
      do {
        const res: any = await slack.users.conversations({ types, exclude_archived: true, limit: 200, cursor });
        out.push(...(res.channels ?? []));
        cursor = res.response_metadata?.next_cursor || undefined;
      } while (cursor);
      return out;
    };
    let convs: any[];
    try {
      convs = await listConversations("public_channel,private_channel,im,mpim");
    } catch (e) {
      if ((e as any)?.data?.error !== "missing_scope") throw e;
      convs = await listConversations("public_channel,private_channel");
    }

    for (const conv of convs) {
      const name = await convName(slack, connectionId, conv);
      await upsertDestination({ userId: conn.userId, connectionId, platform: "slack", externalId: conv.id, name, kind: kindOf(conv) });
      const hist: any = await slack.conversations.history({ channel: conv.id, oldest: String(oldestMs / 1000), limit: 30 }).catch(() => null);
      for (const m of hist?.messages ?? []) {
        if (m.subtype && m.subtype !== "thread_broadcast" && m.subtype !== "file_share") continue;
        await ingestMessage({
          userId: conn.userId,
          connectionId,
          platform: "slack",
          chatId: conv.id,
          chatName: name,
          chatKind: kindOf(conv),
          messageId: String(m.ts),
          senderName: await userName(slack, connectionId, m.user),
          fromMe: Boolean(conn.slackUserId && m.user === conn.slackUserId),
          text: String(m.text || ""),
          occurredAt: new Date(Number(m.ts) * 1000),
          history: firstSync,
        }).catch(() => undefined);
      }
    }
    await connections().updateOne({ _id: connectionId }, { $set: { syncedAt: startedAt, heartbeatAt: new Date() } });
  } catch (e) {
    const msg = (e as any)?.data?.error || (e as Error).message;
    if (/invalid_auth|token_revoked|account_inactive|not_authed/.test(msg)) {
      await setConnectionStatus(connectionId, "error", { lastError: "Slack signed RelayFlow out. Reconnect Slack to continue." });
    } else {
      console.error(`[slack] sync failed connection=${connectionId.slice(-8)}: ${msg}`);
    }
  } finally {
    syncing.delete(connectionId);
  }
}

// ---- Real-time: Slack Events API ----

/** Verify a request really came from Slack (signing secret + 5-minute replay window). */
export function verifySlackSignature(rawBody: string, timestamp?: string, signature?: string): boolean {
  if (!env.slack.signingSecret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = "v0=" + createHmac("sha256", env.slack.signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Handle one Events API callback: store the message and run instant monitors/auto-replies. */
export async function handleSlackEvent(payload: any): Promise<void> {
  const event = payload?.event;
  if (payload?.type !== "event_callback" || event?.type !== "message") return;
  if (event.subtype && event.subtype !== "thread_broadcast" && event.subtype !== "file_share") return;
  const teamId = payload.team_id || event.team;
  const authorizedUsers: string[] = (payload.authorizations ?? []).map((a: any) => a.user_id).concat(payload.authed_users ?? []);
  const conns = await connections().find({ platform: "slack", externalId: teamId, status: "connected" }).toArray();
  for (const conn of conns) {
    if (conn.slackUserId && authorizedUsers.length && !authorizedUsers.includes(conn.slackUserId)) continue;
    try {
      const slack = await client(conn._id);
      const kind: ChatKind = event.channel_type === "im" ? "dm" : event.channel_type === "mpim" ? "group" : "channel";
      await ingestMessage({
        userId: conn.userId,
        connectionId: conn._id,
        platform: "slack",
        chatId: event.channel,
        chatName: null, // keep the name we registered during sync
        chatKind: kind,
        messageId: String(event.ts),
        senderName: await userName(slack, conn._id, event.user),
        fromMe: Boolean(conn.slackUserId && event.user === conn.slackUserId),
        text: String(event.text || ""),
        occurredAt: new Date(Number(event.ts) * 1000),
      });
      await connections().updateOne({ _id: conn._id }, { $set: { liveEventsAt: new Date() } });
    } catch (e) {
      console.error(`[slack] event ingest failed: ${(e as Error).message}`);
    }
  }
}

/** Every scheduler tick: if live events aren't arriving, poll Slack every 2 minutes instead. */
export async function pollSlack(): Promise<void> {
  const now = Date.now();
  const rows = await connections().find({ platform: "slack", status: "connected" }).toArray();
  for (const row of rows) {
    const eventsLive = row.liveEventsAt && now - row.liveEventsAt.getTime() < 30 * 60_000;
    const due = !row.syncedAt || now - row.syncedAt.getTime() >= (eventsLive ? 30 * 60_000 : 2 * 60_000);
    if (due) await syncSlack(row._id);
  }
}

/** On startup: fill in Slack identities for older connections, then catch up. */
export async function resumeSlack(): Promise<void> {
  const rows = await connections().find({ platform: "slack", status: "connected" }).toArray();
  for (const row of rows) {
    try {
      if (!row.slackUserId) {
        const me: any = await (await client(row._id)).auth.test();
        if (me?.user_id) await connections().updateOne({ _id: row._id }, { $set: { slackUserId: me.user_id } });
      }
    } catch {
      /* syncSlack reports auth problems */
    }
    syncSlack(row._id).catch(() => undefined);
  }
}

export async function fetchSlackRecent(
  connectionId: string,
  channelId: string,
  limit: number,
): Promise<{ senderName: string; text: string; occurredAt: Date }[]> {
  const slack = await client(connectionId);
  const res: any = await slack.conversations.history({ channel: channelId, limit });
  const out: { senderName: string; text: string; occurredAt: Date }[] = [];
  for (const m of res.messages ?? []) {
    const text = String(m.text || "").trim();
    if (!text) continue;
    out.push({ senderName: await userName(slack, connectionId, m.user), text, occurredAt: new Date(Number(m.ts) * 1000) });
  }
  return out.reverse();
}

export async function sendSlack(connectionId: string, channelId: string, text: string): Promise<string | null> {
  const slack = await client(connectionId);
  const res: any = await slack.chat.postMessage({ channel: channelId, text });
  return res?.ts ? String(res.ts) : null;
}

export async function disconnectSlack(connectionId: string): Promise<void> {
  await connections().updateOne(
    { _id: connectionId },
    { $set: { status: "disconnected", encryptedCredentials: null, lastError: null, updatedAt: new Date() } },
  );
}
