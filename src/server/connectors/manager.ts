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
  opts: { platform?: Platform; limit?: number } = {},
): Promise<RecentMessage[]> {
  const limit = Math.min(opts.limit ?? 15, 50);
  const query: Record<string, unknown> = { userId, status: "connected" };
  if (opts.platform) query.platform = opts.platform;
  const conns = await connections().find(query).toArray();
  const results: RecentMessage[] = [];

  for (const conn of conns) {
    const dests = await destinations()
      .find({ connectionId: conn._id, selected: { $ne: false } })
      .limit(20)
      .toArray();
    try {
      if (conn.platform === "whatsapp") {
        const nameById = new Map(dests.map((d) => [d.externalId, d.name]));
        const msgs = await channelMessages()
          .find({ connectionId: conn._id })
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

export interface SendResult {
  platform: Platform;
  connectionId: string;
  destinationName: string;
  ok: boolean;
  error?: string;
}

/** Send `content` to every selected destination of a platform (or a specific one). */
export async function sendToPlatform(
  userId: string,
  platform: Platform,
  content: string,
  destinationExternalId?: string,
): Promise<SendResult[]> {
  const conn = await connections().findOne({ userId, platform, status: "connected" });
  if (!conn) return [{ platform, connectionId: "", destinationName: platform, ok: false, error: "not connected" }];

  let targets = await destinations().find({ connectionId: conn._id, selected: { $ne: false } }).toArray();
  if (destinationExternalId) targets = targets.filter((d) => d.externalId === destinationExternalId);
  if (targets.length === 0 && destinationExternalId) {
    targets = [{ externalId: destinationExternalId, name: destinationExternalId } as any];
  }
  if (targets.length === 0) return [{ platform, connectionId: conn._id, destinationName: platform, ok: false, error: "no destination selected" }];

  const results: SendResult[] = [];
  for (const dest of targets) {
    try {
      let externalMessageId: string | null = null;
      if (platform === "whatsapp") externalMessageId = await wa.sendWhatsapp(conn._id, dest.externalId, content);
      else if (platform === "telegram") externalMessageId = await tg.sendTelegram(conn._id, dest.externalId, content);
      else if (platform === "slack") externalMessageId = await slack.sendSlack(conn._id, dest.externalId, content);
      else if (platform === "gmail") externalMessageId = await gmail.sendGmail(conn._id, dest.externalId, "Message from RelayFlow", content);

      await outbound().insertOne({
        _id: uid(),
        userId,
        platform,
        connectionId: conn._id,
        destinationExternalId: dest.externalId,
        content,
        status: "sent",
        externalMessageId,
        error: null,
        createdAt: new Date(),
      });
      // Reflect the sent message in the recent-history cache so the agent sees it too.
      await channelMessages()
        .insertOne({
          _id: uid(),
          userId,
          connectionId: conn._id,
          platform,
          destinationId: dest.externalId,
          destinationName: dest.name,
          externalId: `out:${externalMessageId ?? uid()}`,
          senderName: "You (via RelayFlow)",
          direction: "outbound",
          text: content,
          occurredAt: new Date(),
          createdAt: new Date(),
        })
        .catch(() => undefined);
      results.push({ platform, connectionId: conn._id, destinationName: dest.name, ok: true });
    } catch (error) {
      await outbound().insertOne({
        _id: uid(),
        userId,
        platform,
        connectionId: conn._id,
        destinationExternalId: dest.externalId,
        content,
        status: "failed",
        externalMessageId: null,
        error: (error as Error).message,
        createdAt: new Date(),
      });
      results.push({ platform, connectionId: conn._id, destinationName: dest.name, ok: false, error: (error as Error).message });
    }
  }
  return results;
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
