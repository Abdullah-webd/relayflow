import { channelMessages, connections, destinations, outbound, type Connection, type Platform } from "../db";
import { uid } from "../lib/crypto";
import * as wa from "./whatsapp";
import * as tg from "./telegram";
import * as slack from "./slack";
import * as gmail from "./gmail";
import { messageKey, noteOwnSend } from "./ingest";

// Forgiving group matcher: ignores case, spaces, punctuation and emoji so
// "Study Master", "studymaster", "STUDYMASTER 📚" all match the same group.
const normalizeName = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function matchByGroup<T extends { externalId: string; name: string }>(dests: T[], group: string): T[] {
  const exact = dests.filter((d) => d.externalId === group);
  if (exact.length) return exact;
  const q = normalizeName(group);
  if (!q) return [];
  return dests.filter((d) => {
    const n = normalizeName(d.name);
    return n.length > 0 && (n === q || n.includes(q) || q.includes(n));
  });
}

/** Replace raw platform ids (e.g. "1203…@g.us") with a readable label. */
function readableChatName(name: string, id: string): string {
  if (name && !name.includes("@") && name !== id) return name;
  if (id.endsWith("@g.us")) return "A WhatsApp group (name unavailable)";
  if (id.endsWith("@s.whatsapp.net") || id.endsWith("@lid")) return "A WhatsApp contact";
  return name || "Chat";
}

export interface RecentMessage {
  platform: Platform;
  connectionId: string;
  destinationName: string;
  destinationExternalId: string;
  senderName: string;
  text: string;
  occurredAt: Date;
}

export async function resumeConnections(): Promise<void> {
  await Promise.allSettled([wa.resumeWhatsapp(), tg.resumeTelegram(), slack.resumeSlack()]);
}

/** Close live sessions without logging out (used when this server hands over to a new one). */
export async function stopConnections(): Promise<void> {
  await Promise.allSettled([wa.stopAllWhatsapp(), tg.stopAllTelegram()]);
}

export interface ConnectionView {
  id: string;
  platform: Platform;
  status: string;
  displayName: string;
  lastError: string | null;
  selectedCount: number;
  updatedAt: Date;
}

export async function listUserConnections(userId: string): Promise<ConnectionView[]> {
  const rows = await connections().find({ userId }).sort({ platform: 1 }).toArray();
  const views: ConnectionView[] = [];
  for (const row of rows) {
    const selectedCount = await destinations().countDocuments({ connectionId: row._id, selected: { $ne: false } });
    views.push({
      id: row._id,
      platform: row.platform,
      status: row.status,
      displayName: row.displayName || row.platform,
      lastError: row.lastError,
      selectedCount,
      updatedAt: row.updatedAt,
    });
  }
  return views;
}

export async function connectedPlatforms(userId: string): Promise<Connection[]> {
  return connections().find({ userId, status: "connected" }).toArray();
}

/**
 * Recent messages across the user's chats (groups, channels and private chats), newest first.
 * Every channel stores messages as they arrive (see ingest.ts), so this reads the store; for a
 * Telegram/Slack connection with nothing stored yet it falls back to a live fetch.
 */
export async function getRecentMessages(
  userId: string,
  opts: { platform?: Platform; limit?: number; group?: string | null } = {},
): Promise<RecentMessage[]> {
  const limit = Math.min(opts.limit ?? 25, 60);
  const query: Record<string, unknown> = { userId, status: "connected" };
  if (opts.platform) query.platform = opts.platform;
  const conns = await connections().find(query).toArray();
  const results: RecentMessage[] = [];

  for (const conn of conns) {
    try {
      const dests = await destinations().find({ connectionId: conn._id }).toArray();
      const nameById = new Map(dests.map((d) => [d.externalId, d.name]));
      const msgQuery: Record<string, unknown> = { connectionId: conn._id };
      if (opts.group?.trim()) {
        const matched = matchByGroup(dests, opts.group);
        if (!matched.length) continue;
        msgQuery.destinationId = { $in: matched.map((d) => d.externalId) };
      } else {
        const excluded = dests.filter((d) => d.selected === false).map((d) => d.externalId);
        if (excluded.length) msgQuery.destinationId = { $nin: excluded };
      }
      const msgs = await channelMessages().find(msgQuery).sort({ occurredAt: -1 }).limit(limit).toArray();
      for (const m of msgs) {
        results.push({
          platform: conn.platform,
          connectionId: conn._id,
          destinationName: readableChatName(nameById.get(m.destinationId) || m.destinationName, m.destinationId),
          destinationExternalId: m.destinationId,
          senderName: m.senderName,
          text: m.text,
          occurredAt: m.occurredAt,
        });
      }

      // Nothing stored yet for this Telegram/Slack connection (e.g. right after connecting):
      // read live from the most relevant chats so the answer is never falsely empty.
      if (msgs.length === 0 && (conn.platform === "telegram" || conn.platform === "slack")) {
        const pool = opts.group?.trim() ? matchByGroup(dests, opts.group) : dests.filter((d) => d.selected !== false);
        for (const d of pool.slice(0, 8)) {
          const recent =
            conn.platform === "telegram"
              ? await tg.fetchTelegramRecent(conn._id, d.externalId, 10)
              : await slack.fetchSlackRecent(conn._id, d.externalId, 10);
          recent.forEach((r) =>
            results.push({ platform: conn.platform, connectionId: conn._id, destinationName: d.name, destinationExternalId: d.externalId, ...r }),
          );
        }
      }
    } catch (error) {
      console.error(`[manager] recent read failed for ${conn.platform}: ${(error as Error).message}`);
    }
  }

  return results.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, limit);
}

/** Chats (groups, channels, private chats) whose name matches `group`. */
export async function findChats(userId: string, group: string, platform?: Platform): Promise<{ name: string; platform: Platform }[]> {
  const query: Record<string, unknown> = { userId, status: "connected" };
  if (platform) query.platform = platform;
  const out: { name: string; platform: Platform }[] = [];
  for (const conn of await connections().find(query).toArray()) {
    const dests = await destinations().find({ connectionId: conn._id }).toArray();
    for (const d of matchByGroup(dests, group)) out.push({ name: d.name, platform: conn.platform });
  }
  return out;
}

export interface DestinationView {
  platform: Platform;
  id: string;
  externalId: string;
  name: string;
  kind: string;
  selected: boolean;
}

/** List every group/channel the user has across connected platforms, with names. */
export async function listDestinations(userId: string, platform?: Platform): Promise<DestinationView[]> {
  const query: Record<string, unknown> = { userId, status: "connected" };
  if (platform) query.platform = platform;
  const conns = await connections().find(query).toArray();
  const out: DestinationView[] = [];
  for (const conn of conns) {
    const dests = await destinations().find({ connectionId: conn._id }).sort({ name: 1 }).toArray();
    for (const d of dests) {
      out.push({ platform: conn.platform, id: d._id, externalId: d.externalId, name: d.name, kind: d.kind, selected: d.selected !== false });
    }
  }
  return out;
}

export interface SendTarget {
  platform: Platform;
  connectionId: string;
  externalId: string;
  name: string;
}

/** Resolve which concrete destinations a request maps to. `group` filters by name (fuzzy) or id. */
export async function resolveSendTargets(userId: string, platforms: string[], group?: string | null): Promise<SendTarget[]> {
  const connected = await connections().find({ userId, status: "connected" }).toArray();
  const targets: SendTarget[] = [];

  // A named group identifies the destination on its own — find it across ALL connected
  // platforms, regardless of which platform the model guessed in `platforms`.
  if (group && group.trim()) {
    let pool = connected;
    if (platforms.length && !platforms.includes("all")) {
      const wanted = new Set(platforms);
      const narrowed = connected.filter((c) => wanted.has(c.platform));
      if (narrowed.length) pool = narrowed; // only narrow if it still yields candidates
    }
    for (const conn of pool) {
      const dests = await destinations().find({ connectionId: conn._id }).toArray();
      for (const d of matchByGroup(dests, group)) {
        targets.push({ platform: conn.platform, connectionId: conn._id, externalId: d.externalId, name: d.name });
      }
    }
    return targets;
  }

  // No group: send to the selected destinations of the chosen platforms.
  const connectedSet = new Set(connected.map((c) => c.platform));
  const targetPlatforms = platforms.includes("all") ? [...connectedSet] : (platforms as Platform[]).filter((p) => connectedSet.has(p));
  for (const p of targetPlatforms) {
    const conn = connected.find((c) => c.platform === p);
    if (!conn) continue;
    // Broadcasts go to groups/channels only — never to private chats (those need a name).
    const dests = (await destinations().find({ connectionId: conn._id }).toArray()).filter(
      (d) => d.selected !== false && d.kind !== "dm",
    );
    for (const d of dests) targets.push({ platform: p, connectionId: conn._id, externalId: d.externalId, name: d.name });
  }
  return targets;
}

export interface SendResult {
  platform: Platform;
  connectionId: string;
  destinationName: string;
  ok: boolean;
  error?: string;
}

async function deliverOne(userId: string, t: SendTarget, content: string): Promise<SendResult> {
  try {
    noteOwnSend(t.connectionId, t.externalId, content);
    let externalMessageId: string | null = null;
    if (t.platform === "whatsapp") externalMessageId = await wa.sendWhatsapp(t.connectionId, t.externalId, content);
    else if (t.platform === "telegram") externalMessageId = await tg.sendTelegram(t.connectionId, t.externalId, content);
    else if (t.platform === "slack") externalMessageId = await slack.sendSlack(t.connectionId, t.externalId, content);
    else if (t.platform === "gmail") externalMessageId = await gmail.sendGmail(t.connectionId, t.externalId, "Message from RelayFlow", content);

    await outbound().insertOne({
      _id: uid(), userId, platform: t.platform, connectionId: t.connectionId, destinationExternalId: t.externalId,
      content, status: "sent", externalMessageId, error: null, createdAt: new Date(),
    });
    await channelMessages()
      .insertOne({
        _id: uid(), userId, connectionId: t.connectionId, platform: t.platform, destinationId: t.externalId,
        destinationName: t.name, externalId: messageKey(t.externalId, externalMessageId ?? `out-${uid()}`), senderName: "You (via RelayFlow)",
        direction: "outbound", text: content, occurredAt: new Date(), createdAt: new Date(),
      })
      .catch(() => undefined);
    return { platform: t.platform, connectionId: t.connectionId, destinationName: t.name, ok: true };
  } catch (error) {
    await outbound().insertOne({
      _id: uid(), userId, platform: t.platform, connectionId: t.connectionId, destinationExternalId: t.externalId,
      content, status: "failed", externalMessageId: null, error: (error as Error).message, createdAt: new Date(),
    });
    return { platform: t.platform, connectionId: t.connectionId, destinationName: t.name, ok: false, error: (error as Error).message };
  }
}

/** Send `content` to an explicit, already-resolved list of targets. */
export async function sendToTargets(userId: string, targets: SendTarget[], content: string): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (const t of targets) results.push(await deliverOne(userId, t, content));
  return results;
}

/** Backward-compatible: send to all selected destinations of a platform (or one). */
export async function sendToPlatform(
  userId: string,
  platform: Platform,
  content: string,
  destinationExternalId?: string,
): Promise<SendResult[]> {
  let targets = await resolveSendTargets(userId, [platform], null);
  if (destinationExternalId) targets = targets.filter((t) => t.externalId === destinationExternalId);
  if (targets.length === 0) return [{ platform, connectionId: "", destinationName: platform, ok: false, error: "no destination" }];
  return sendToTargets(userId, targets, content);
}

export async function disconnectConnection(userId: string, connectionId: string): Promise<void> {
  const conn = await connections().findOne({ _id: connectionId, userId });
  if (!conn) return;
  if (conn.platform === "whatsapp") await wa.disconnectWhatsapp(connectionId);
  else if (conn.platform === "telegram") await tg.disconnectTelegram(connectionId);
  else if (conn.platform === "slack") await slack.disconnectSlack(connectionId);
  else if (conn.platform === "gmail") await gmail.disconnectGmail(connectionId);
  await destinations().deleteMany({ connectionId });
}
