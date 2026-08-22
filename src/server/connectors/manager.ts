import { channelMessages, connections, destinations, outbound, type Connection, type Platform } from "../db";
import { uid } from "../lib/crypto";
import * as wa from "./whatsapp";
import * as tg from "./telegram";
import * as slack from "./slack";
import * as gmail from "./gmail";

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
  await Promise.allSettled([wa.resumeWhatsapp(), tg.resumeTelegram()]);
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

/** Pull a small, recent slice of messages across the user's selected destinations. */
export async function getRecentMessages(
  userId: string,
  opts: { platform?: Platform; limit?: number; group?: string | null } = {},
): Promise<RecentMessage[]> {
  const limit = Math.min(opts.limit ?? 15, 50);
  const query: Record<string, unknown> = { userId, status: "connected" };
  if (opts.platform) query.platform = opts.platform;
  const conns = await connections().find(query).toArray();
  const results: RecentMessage[] = [];
  const groupQuery = opts.group?.trim().toLowerCase();

  for (const conn of conns) {
    let dests = await destinations().find({ connectionId: conn._id }).limit(300).toArray();
    if (groupQuery) {
      const exact = dests.filter((d) => d.externalId === opts.group);
      dests = exact.length ? exact : dests.filter((d) => (d.name || "").toLowerCase().includes(groupQuery));
    } else {
      dests = dests.filter((d) => d.selected !== false).slice(0, 20);
    }
    try {
      if (conn.platform === "whatsapp") {
        const nameById = new Map(dests.map((d) => [d.externalId, d.name]));
        const msgs = await channelMessages()
          .find({ connectionId: conn._id, destinationId: { $in: dests.map((d) => d.externalId) } })
          .sort({ occurredAt: -1 })
          .limit(limit)
          .toArray();
        for (const m of msgs) {
          results.push({
            platform: "whatsapp",
            connectionId: conn._id,
            destinationName: nameById.get(m.destinationId) || m.destinationName,
            destinationExternalId: m.destinationId,
            senderName: m.senderName,
            text: m.text,
            occurredAt: m.occurredAt,
          });
        }
      } else if (conn.platform === "telegram") {
        for (const d of dests.slice(0, 6)) {
          const recent = await tg.fetchTelegramRecent(conn._id, d.externalId, Math.min(limit, 12));
          recent.forEach((r) =>
            results.push({ platform: "telegram", connectionId: conn._id, destinationName: d.name, destinationExternalId: d.externalId, ...r }),
          );
        }
      } else if (conn.platform === "slack") {
        for (const d of dests.slice(0, 6)) {
          const recent = await slack.fetchSlackRecent(conn._id, d.externalId, Math.min(limit, 12));
          recent.forEach((r) =>
            results.push({ platform: "slack", connectionId: conn._id, destinationName: d.name, destinationExternalId: d.externalId, ...r }),
          );
        }
      } else if (conn.platform === "gmail") {
        const recent = await gmail.fetchGmailRecent(conn._id, Math.min(limit, 15));
        recent.forEach((r) =>
          results.push({ platform: "gmail", connectionId: conn._id, destinationName: conn.displayName, destinationExternalId: conn.externalId || "", ...r }),
        );
      }
    } catch (error) {
      console.error(`[manager] recent fetch failed for ${conn.platform}: ${(error as Error).message}`);
    }
  }

  return results.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, limit * 2);
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
    const q = group.trim().toLowerCase();
    let pool = connected;
    if (platforms.length && !platforms.includes("all")) {
      const wanted = new Set(platforms);
      const narrowed = connected.filter((c) => wanted.has(c.platform));
      if (narrowed.length) pool = narrowed; // only narrow if it still yields candidates
    }
    for (const conn of pool) {
      const dests = await destinations().find({ connectionId: conn._id }).toArray();
      const exact = dests.filter((d) => d.externalId === group);
      const matched = exact.length ? exact : dests.filter((d) => (d.name || "").toLowerCase().includes(q));
      for (const d of matched) targets.push({ platform: conn.platform, connectionId: conn._id, externalId: d.externalId, name: d.name });
    }
    return targets;
  }

  // No group: send to the selected destinations of the chosen platforms.
  const connectedSet = new Set(connected.map((c) => c.platform));
  const targetPlatforms = platforms.includes("all") ? [...connectedSet] : (platforms as Platform[]).filter((p) => connectedSet.has(p));
  for (const p of targetPlatforms) {
    const conn = connected.find((c) => c.platform === p);
    if (!conn) continue;
    const dests = (await destinations().find({ connectionId: conn._id }).toArray()).filter((d) => d.selected !== false);
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
        destinationName: t.name, externalId: `out:${externalMessageId ?? uid()}`, senderName: "You (via RelayFlow)",
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
