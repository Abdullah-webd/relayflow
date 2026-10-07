import type { FastifyInstance } from "fastify";
import { autoReplies, channelMessages, connections, destinations, monitors, responders, scheduledTasks, users } from "../db";
import { requireActivePlan } from "../auth/context";
import { ensureLegacyResponder } from "../knowledge/knowledge";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day (YYYY-MM-DD) in the user's timezone. */
function dayKey(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export async function overviewRoutes(app: FastifyInstance) {
  // The home screen: what's happening across channels and automations, in one call.
  app.get("/overview", { preHandler: requireActivePlan }, async (req) => {
    const userId = req.userId!;
    await ensureLegacyResponder(userId);
    const user = await users().findOne({ _id: userId });
    const tz = user?.timezone || "UTC";
    const now = Date.now();
    const weekAgo = new Date(now - 7 * DAY_MS);

    const [conns, resp, mons, tasks, replies, msgs] = await Promise.all([
      connections().find({ userId, status: { $ne: "disconnected" } }).toArray(),
      responders().find({ userId }).toArray(),
      monitors().find({ userId }).sort({ lastCheckedAt: -1 }).toArray(),
      scheduledTasks().find({ userId }).sort({ runAt: 1 }).toArray(),
      autoReplies().find({ userId, createdAt: { $gte: weekAgo } }).sort({ createdAt: -1 }).toArray(),
      channelMessages()
        .find({ userId, occurredAt: { $gte: weekAgo }, direction: "inbound" })
        .project({ platform: 1, occurredAt: 1, connectionId: 1 })
        .toArray(),
    ]);

    // Inbound messages per local day (last 7 days, oldest first), split by channel.
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) days.push(dayKey(new Date(now - i * DAY_MS), tz));
    const volume = days.map((day) => ({ day, whatsapp: 0, telegram: 0, slack: 0 }));
    const lastByConn = new Map<string, Date>();
    const dayCount = new Map<string, number>();
    for (const m of msgs as any[]) {
      const row = volume[days.indexOf(dayKey(m.occurredAt, tz))];
      if (row && m.platform in row) (row as any)[m.platform]++;
      if (now - m.occurredAt.getTime() < DAY_MS) dayCount.set(m.connectionId, (dayCount.get(m.connectionId) ?? 0) + 1);
      const prev = lastByConn.get(m.connectionId);
      if (!prev || prev < m.occurredAt) lastByConn.set(m.connectionId, m.occurredAt);
    }

    const channels = [];
    for (const c of conns) {
      channels.push({
        id: c._id,
        platform: c.platform,
        status: c.status,
        displayName: c.displayName,
        groups: await destinations().countDocuments({ connectionId: c._id, userId }),
        messages24h: dayCount.get(c._id) ?? 0,
        lastMessageAt: lastByConn.get(c._id) ?? null,
      });
    }

    // One time-ordered feed of what RelayFlow did on the user's behalf.
    const activity = [
      ...replies.slice(0, 12).map((r) => ({
        id: `r-${r._id}`,
        kind: r.replied ? ("replied" as const) : ("silent" as const),
        title: r.replied ? `Answered ${r.incomingFrom}` : `Left a question for you`,
        detail: r.replied ? r.replyText : r.incomingText,
        where: `${r.destinationName}`,
        platform: r.platform,
        source: r.responderName ?? null,
        at: r.createdAt,
      })),
      ...mons
        .filter((m) => m.lastResult && /^(Matched|Arrived|Absence)/.test(m.lastResult) && m.lastCheckedAt)
        .slice(0, 6)
        .map((m) => ({
          id: `m-${m._id}`,
          kind: "alert" as const,
          title: m.title,
          detail: m.lastResult,
          where: m.group ?? null,
          platform: m.platform,
          source: "Monitor",
          at: m.lastCheckedAt!,
        })),
      ...tasks
        .filter((t) => t.lastRunAt)
        .slice(0, 6)
        .map((t) => ({ id: `t-${t._id}`, kind: "task" as const, title: t.title, detail: t.lastResult, where: null, platform: null, source: "Schedule", at: t.lastRunAt! })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);

    const sent = replies.filter((r) => r.replied).length;
    return {
      channels,
      volume,
      autoReplies: { live: resp.filter((r) => r.active).length, total: resp.length, sent7d: sent, silent7d: replies.length - sent },
      monitors: { active: mons.filter((m) => m.active).length, total: mons.length },
      upcoming: tasks
        .filter((t) => t.active && t.runAt)
        .slice(0, 4)
        .map((t) => ({ id: t._id, title: t.title, schedule: t.schedule, runAt: t.runAt })),
      activity,
      setup: {
        connected: conns.some((c) => c.status === "connected"),
        autoReply: resp.some((r) => r.active),
        monitor: mons.length > 0,
        schedule: tasks.length > 0,
      },
    };
  });

  // Every connected channel with its groups/chats: feeds the group pickers (monitors, auto-replies).
  app.get("/channels", { preHandler: requireActivePlan }, async (req) => {
    const userId = req.userId!;
    const conns = await connections().find({ userId, status: "connected" }).toArray();
    const out = [];
    for (const c of conns) {
      const dests = await destinations().find({ connectionId: c._id, userId }).sort({ name: 1 }).toArray();
      out.push({ connectionId: c._id, platform: c.platform, displayName: c.displayName, destinations: dests.map((d) => ({ id: d._id, name: d.name, kind: d.kind })) });
    }
    return { channels: out };
  });
}
