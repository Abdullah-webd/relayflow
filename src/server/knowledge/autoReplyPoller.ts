import { connections } from "../db";
import { getRecentMessages } from "../connectors/manager";
import { handleInbound } from "./autoReply";

const MAX_PER_TICK = 5; // don't flood a channel if a burst arrives

/**
 * Every scheduler tick: for each auto-reply-enabled channel, pick up messages that arrived
 * since we last looked and run them through the confidence gate. WhatsApp inbound is already
 * recorded live, so this catches it within ~a minute; Telegram/Slack/Gmail are fetched here.
 */
export async function runAutoReplyTick(): Promise<void> {
  const conns = await connections().find({ autoReplyEnabled: true, status: "connected" }).limit(50).toArray();
  for (const conn of conns) {
    try {
      // First time enabled: set the watermark to "now" so we never reply to old history.
      if (!conn.autoReplyLastSeenAt) {
        await connections().updateOne({ _id: conn._id }, { $set: { autoReplyLastSeenAt: new Date() } });
        continue;
      }
      const since = new Date(conn.autoReplyLastSeenAt).getTime();
      const recent = await getRecentMessages(conn.userId, { platform: conn.platform, limit: 25 });
      const fresh = recent
        .filter((r) => r.connectionId === conn._id)
        .filter((r) => r.occurredAt.getTime() > since)
        .filter((r) => r.senderName !== "You (via RelayFlow)")
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

      const newest = recent.reduce((mx, r) => Math.max(mx, r.occurredAt.getTime()), since);
      // Advance the watermark first so a slow/errored reply never causes a re-reply loop.
      await connections().updateOne({ _id: conn._id }, { $set: { autoReplyLastSeenAt: new Date(newest) } });

      for (const m of fresh.slice(0, MAX_PER_TICK)) {
        await handleInbound({
          userId: conn.userId,
          platform: conn.platform,
          connectionId: conn._id,
          destinationExternalId: m.destinationExternalId,
          destinationName: m.destinationName,
          senderName: m.senderName,
          text: m.text,
        });
      }
    } catch (error) {
      console.error(`[auto-reply] tick failed for ${conn.platform}: ${(error as Error).message}`);
    }
  }
}
