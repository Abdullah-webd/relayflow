import { destinations, type Platform } from "../db";
import { uid } from "../lib/crypto";
import { recordMessage } from "./store";

/**
 * The single pipeline every channel feeds (WhatsApp, Telegram, Slack). For each message:
 *  1. make sure its chat exists as a destination (groups, channels AND private chats),
 *  2. store it (deduped by chat + message id; kept 14 days),
 *  3. if it's a NEW live message: run auto-reply (inbound only) and wake the user's monitors.
 * Backfilled history is stored but never triggers replies or alerts.
 */
export type ChatKind = "group" | "channel" | "dm";

export interface IngestInput {
  userId: string;
  connectionId: string;
  platform: Platform;
  chatId: string;
  chatName?: string | null; // authoritative chat name when known (group subject, contact name)
  chatKind: ChatKind;
  messageId: string;
  senderName: string;
  fromMe: boolean; // sent from the user's own account (phone/app), not by a contact
  text: string;
  occurredAt: Date;
  history?: boolean; // backfill / catch-up: store only
}

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const LIVE_WINDOW_MS = 5 * 60 * 1000; // older "live" events are treated as history (e.g. after a reconnect)

/** Message ids are `${chatId}:${messageId}` on every platform (sends use the same format). */
export const messageKey = (chatId: string, messageId: string) => `${chatId}:${messageId}`;

// Texts RelayFlow itself just sent, so their echo is labelled correctly and never re-triggers hooks.
const recentSends = new Map<string, number>();
export function noteOwnSend(connectionId: string, chatId: string, text: string): void {
  recentSends.set(`${connectionId}|${chatId}|${text.trim()}`, Date.now());
}
function isOwnSendEcho(connectionId: string, chatId: string, text: string): boolean {
  const key = `${connectionId}|${chatId}|${text.trim()}`;
  const at = recentSends.get(key);
  if (at && Date.now() - at < 120_000) {
    recentSends.delete(key);
    return true;
  }
  return false;
}
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [k, at] of recentSends) if (at < cutoff) recentSends.delete(k);
}, 60_000).unref?.();

export async function ingestMessage(m: IngestInput): Promise<boolean> {
  const text = (m.text || "").trim();
  if (!text) return false;
  const age = Date.now() - m.occurredAt.getTime();
  if (age > RETENTION_MS) return false;

  // 1. Destination (create on first sight; refresh the name when we know it for sure).
  const now = new Date();
  await destinations().updateOne(
    { connectionId: m.connectionId, externalId: m.chatId },
    {
      ...(m.chatName ? { $set: { name: m.chatName, kind: m.chatKind, updatedAt: now } } : {}),
      $setOnInsert: {
        _id: uid(),
        userId: m.userId,
        connectionId: m.connectionId,
        platform: m.platform,
        externalId: m.chatId,
        ...(m.chatName ? {} : { name: m.chatKind === "dm" ? "Private chat" : "Chat", kind: m.chatKind }),
        selected: true,
        createdAt: now,
        ...(m.chatName ? {} : { updatedAt: now }),
      },
    },
    { upsert: true },
  );
  const dest = await destinations().findOne({ connectionId: m.connectionId, externalId: m.chatId });
  if (dest?.selected === false) return false; // the user excluded this chat

  // 2. Store.
  const viaRelayFlow = m.fromMe && isOwnSendEcho(m.connectionId, m.chatId, text);
  const isNew = await recordMessage({
    userId: m.userId,
    connectionId: m.connectionId,
    platform: m.platform,
    destinationId: m.chatId,
    destinationName: dest?.name || m.chatName || m.chatId,
    externalId: messageKey(m.chatId, m.messageId),
    senderName: viaRelayFlow ? "You (via RelayFlow)" : m.fromMe ? "You" : m.senderName || "Someone",
    direction: m.fromMe ? "outbound" : "inbound",
    text,
    occurredAt: m.occurredAt,
  });
  if (!isNew || m.history || viaRelayFlow || age > LIVE_WINDOW_MS) return isNew;

  // 3. Real-time hooks (dynamic imports avoid circular module loading).
  if (!m.fromMe && dest?.autoReplyEnabled) {
    await destinations()
      .updateOne({ _id: dest._id }, { $set: { autoReplyLastSeenAt: m.occurredAt } })
      .catch(() => undefined); // the safety-net poller won't answer this one again
    const { handleInbound } = await import("../knowledge/autoReply");
    handleInbound({
      userId: m.userId,
      platform: m.platform,
      connectionId: m.connectionId,
      destinationExternalId: m.chatId,
      destinationName: dest.name,
      senderName: m.senderName,
      text,
    }).catch((e) => console.error(`[ingest] auto-reply failed: ${(e as Error).message}`));
  }
  const { triggerMonitors } = await import("../monitors");
  triggerMonitors(m.userId, m.platform);
  return true;
}
