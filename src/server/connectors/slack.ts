import { WebClient } from "@slack/web-api";
import { env } from "../env";
import { connections } from "../db";
import { decryptJson, encryptJson, encryptString, decryptString, uid } from "../lib/crypto";
import { setConnectionStatus, upsertDestination } from "./store";

const SLACK_USER_SCOPES = "channels:read,channels:history,groups:read,groups:history,chat:write";

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
        encryptedCredentials: encryptJson({ token }),
        lastError: null,
        heartbeatAt: now,
        updatedAt: now,
      },
      $setOnInsert: { _id: connectionId, createdAt: now },
    },
    { upsert: true },
  );
  await syncChannels(userId, connectionId);
  return connectionId;
}

async function syncChannels(userId: string, connectionId: string): Promise<void> {
  try {
    const slack = await client(connectionId);
    let cursor: string | undefined;
    do {
      const res: any = await slack.conversations.list({
        types: "public_channel,private_channel",
        exclude_archived: true,
        limit: 200,
        cursor,
      });
      for (const channel of res.channels ?? []) {
        await upsertDestination({
          userId,
          connectionId,
          platform: "slack",
          externalId: channel.id,
          name: channel.name || channel.id,
          kind: "channel",
        });
      }
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch {
    /* retry later */
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
    out.push({
      senderName: m.user || m.bot_id || "Slack member",
      text,
      occurredAt: new Date(Number(m.ts) * 1000),
    });
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
