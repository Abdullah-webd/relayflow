import { connections, destinations } from "../db";
import { getRecentMessages } from "../connectors/manager";
import { handleInbound } from "./autoReply";

const MAX_PER_TICK = 5; // don't flood a channel if a burst arrives

/**
 * Every scheduler tick: for each group/channel the user turned auto-reply ON for, pick up
 * messages that arrived since we last looked and run them through the confidence gate.
 * Auto-reply is chosen per destination, so we iterate destinations (not whole platforms).
 */
export async function runAutoReplyTick(): Promise<void> {
  const dests = await destinations().find({ autoReplyEnabled: true }).limit(200).toArray();
  if (dests.length === 0) return;

  for (const dest of dests) {
    try {
      const conn = await connections().findOne({ _id: dest.connectionId, userId: dest.userId, status: "connected" });
      if (!conn) continue; // channel disconnected — skip quietly

      // First time enabled: set the watermark to "now" so we never reply to old history.
      if (!dest.autoReplyLastSeenAt) {
        await destinations().updateOne({ _id: dest._id }, { $set: { autoReplyLastSeenAt: new Date() } });
        continue;
      }
      const since = new Date(dest.autoReplyLastSeenAt).getTime();

      // Read recent messages for THIS specific group/channel.
      const recent = await getRecentMessages(conn.userId, { platform: conn.platform, group: dest.externalId, limit: 25 });
      const mine = recent.filter((r) => r.destinationExternalId === dest.externalId || conn.platform === "gmail");
      const fresh = mine
        .filter((r) => r.occurredAt.getTime() > since)
        .filter((r) => r.senderName !== "You (via RelayFlow)")
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

      const newest = mine.reduce((mx, r) => Math.max(mx, r.occurredAt.getTime()), since);
      // Advance the watermark first so a slow/errored reply never causes a re-reply loop.
      await destinations().updateOne({ _id: dest._id }, { $set: { autoReplyLastSeenAt: new Date(newest) } });

      for (const m of fresh.slice(0, MAX_PER_TICK)) {
        await handleInbound({
          userId: conn.userId,
          platform: conn.platform,
          connectionId: conn._id,
          destinationExternalId: dest.externalId,
          destinationName: dest.name,
          senderName: m.senderName,
          text: m.text,
        });
      }
    } catch (error) {
      console.error(`[auto-reply] tick failed for ${dest.platform}/${dest.name}: ${(error as Error).message}`);
    }
  }
}
