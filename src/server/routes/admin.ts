import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  autoReplies,
  channelMessages,
  chatMessages,
  chats,
  connections,
  monitors,
  outbound,
  reports,
  responders,
  scheduledTasks,
  usageDaily,
  users,
  type User,
} from "../db";
import { adminConfigured, adminFromRequest, adminLogin, adminLogout, clearAdminCookie, requireAdmin, setAdminCookie } from "../admin/auth";
import { PLANS, effectiveStatus, trialExpired } from "../billing/plans";
import { reportView, dayKey, CATEGORY_LABEL } from "./reports";
import { sendEmail } from "../lib/email";

const DAY = 86_400_000;
const ONLINE_MS = 2 * 60_000;

/** The last `n` UTC days, oldest first, as YYYY-MM-DD. */
const lastDays = (n: number) => Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() - (n - 1 - i) * DAY)));

/** Count documents per UTC day of `field`, aligned to `days`. */
async function perDay(coll: any, field: string, days: string[], match: Record<string, unknown> = {}): Promise<number[]> {
  const rows: { _id: string; n: number }[] = await coll
    .aggregate([
      { $match: { ...match, [field]: { $gte: new Date(`${days[0]}T00:00:00Z`) } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field}` } }, n: { $sum: 1 } } },
    ])
    .toArray();
  const m = new Map(rows.map((r) => [r._id, r.n]));
  return days.map((d) => m.get(d) ?? 0);
}

/** Who someone is, for lists: plan + status in plain words. */
function planLabel(u: User): { label: string; tone: "live" | "brand" | "warn" | "idle" | "bad" } {
  if (u.compAccess) return { label: "Comp (free Pro)", tone: "brand" };
  const s = effectiveStatus(u);
  if (s === "active") return { label: u.plan === "starter" ? "Starter" : "Pro", tone: "live" };
  if (s === "trialing") return { label: "Trial", tone: "brand" };
  if (s === "trial_expired") return { label: "Trial ended", tone: "warn" };
  if (s === "past_due") return { label: "Payment due", tone: "bad" };
  if (s === "canceled") return { label: "Canceled", tone: "idle" };
  return { label: "No plan", tone: "idle" };
}

const isPaying = (u: User) => !u.compAccess && u.subscriptionStatus === "active" && Boolean(u.stripeSubscriptionId);
const mrrOf = (list: User[]) => list.filter(isPaying).reduce((s, u) => s + PLANS[u.plan === "starter" ? "starter" : "pro"].priceUsd, 0);

async function countBy(coll: any, match: Record<string, unknown> = {}): Promise<Map<string, number>> {
  const rows: { _id: string; n: number }[] = await coll.aggregate([{ $match: match }, { $group: { _id: "$userId", n: { $sum: 1 } } }]).toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

export async function adminRoutes(app: FastifyInstance) {
  // ---------- auth ----------
  app.get("/admin/status", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const email = await adminFromRequest(req);
    return { configured: adminConfigured(), signedIn: Boolean(email), email };
  });

  app.post("/admin/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = z.object({ email: z.string().max(200), password: z.string().max(500) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", detail: "Enter the admin email and password." });
    const res = await adminLogin(parsed.data.email, parsed.data.password, req.ip);
    if (!res.ok) {
      if (res.reason === "not_configured") return reply.code(503).send({ error: "not_configured", detail: "Admin sign-in isn't set up on this server yet." });
      if (res.reason === "locked") return reply.code(429).send({ error: "locked", detail: "Too many wrong attempts from this network. Try again in an hour." });
      return reply.code(401).send({ error: "invalid", detail: "That email and password don't match." });
    }
    setAdminCookie(reply, res.token);
    return { ok: true };
  });

  app.post("/admin/logout", async (req, reply) => {
    await adminLogout(req);
    clearAdminCookie(reply);
    return { ok: true };
  });

  // ---------- overview ----------
  app.get("/admin/overview", { preHandler: requireAdmin }, async () => {
    const now = Date.now();
    const days = lastDays(30);
    const today = dayKey();
    const all = await users().find({}).project({ passwordHash: 0 }).toArray() as User[];
    const [usage30, openReports, connected, needsReconnect, signups, recentReports] = await Promise.all([
      usageDaily().aggregate<{ _id: { day: string; userId: string } }>([{ $match: { day: { $gte: days[0] } } }, { $group: { _id: { day: "$day", userId: "$userId" } } }]).toArray(),
      reports().countDocuments({ status: { $ne: "resolved" } }),
      connections().countDocuments({ status: "connected" }),
      connections().countDocuments({ status: "error" }),
      perDay(users(), "createdAt", days),
      reports().find({}).sort({ createdAt: -1 }).limit(8).toArray(),
    ]);
    const dauMap = new Map<string, number>();
    const weekUsers = new Set<string>();
    for (const r of usage30) {
      dauMap.set(r._id.day, (dauMap.get(r._id.day) ?? 0) + 1);
      if (r._id.day >= dayKey(new Date(now - 6 * DAY))) weekUsers.add(r._id.userId);
    }
    const label = (u: User) => u.name || u.email;
    const online = all
      .filter((u) => u.lastSeenAt && now - new Date(u.lastSeenAt).getTime() < ONLINE_MS)
      .sort((a, b) => +new Date(b.lastSeenAt!) - +new Date(a.lastSeenAt!))
      .map((u) => ({ id: u._id, name: label(u), email: u.email, section: u.lastSection ?? null, lastSeenAt: u.lastSeenAt }));
    const paying = all.filter(isPaying);

    const feed = [
      ...[...all].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8).map((u) => ({ id: `u-${u._id}`, kind: "signup" as const, title: `${label(u)} signed up`, detail: u.email, userId: u._id, at: u.createdAt })),
      ...recentReports.map((r) => ({ id: `r-${r._id}`, kind: "report" as const, title: r.title, detail: `${r.email}, ${CATEGORY_LABEL[r.category]}`, userId: r.userId, reportId: r._id, at: r.createdAt })),
    ]
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 12);

    return {
      kpis: {
        users: all.length,
        verified: all.filter((u) => u.emailVerified).length,
        newToday: all.filter((u) => dayKey(new Date(u.createdAt)) === today).length,
        new7d: all.filter((u) => now - +new Date(u.createdAt) < 7 * DAY).length,
        onlineNow: online.length,
        activeToday: dauMap.get(today) ?? 0,
        active7d: weekUsers.size,
        trials: all.filter((u) => u.subscriptionStatus === "trialing" && !trialExpired(u)).length,
        paying: paying.length,
        mrr: mrrOf(all),
        openReports,
        connected,
        needsReconnect,
      },
      online,
      series: { days, signups, dau: days.map((d) => dauMap.get(d) ?? 0) },
      feed,
    };
  });

  // ---------- users ----------
  app.get("/admin/users", { preHandler: requireAdmin }, async (req) => {
    const q = String((req.query as { q?: string }).q || "").trim().toLowerCase();
    const all = (await users().find({}).project({ passwordHash: 0 }).sort({ createdAt: -1 }).toArray()) as User[];
    const weekAgo = dayKey(new Date(Date.now() - 6 * DAY));
    const [conns, resp, mons, tasks, chatCount, openReports, usage] = await Promise.all([
      connections().find({}).project({ userId: 1, platform: 1, status: 1 }).toArray(),
      countBy(responders()),
      countBy(monitors()),
      countBy(scheduledTasks()),
      countBy(chats()),
      countBy(reports(), { status: { $ne: "resolved" } }),
      usageDaily().aggregate<{ _id: string; s: number }>([{ $match: { day: { $gte: weekAgo } } }, { $group: { _id: "$userId", s: { $sum: "$seconds" } } }]).toArray(),
    ]);
    const secs = new Map(usage.map((u) => [u._id, u.s]));
    const list = all
      .filter((u) => !q || u.email.toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q))
      .map((u) => ({
        id: u._id,
        email: u.email,
        name: u.name || null,
        verified: u.emailVerified,
        plan: planLabel(u),
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt ?? null,
        channels: conns.filter((c: any) => c.userId === u._id).map((c: any) => ({ platform: c.platform, status: c.status })),
        autoReplies: resp.get(u._id) ?? 0,
        monitors: mons.get(u._id) ?? 0,
        schedules: tasks.get(u._id) ?? 0,
        chats: chatCount.get(u._id) ?? 0,
        openReports: openReports.get(u._id) ?? 0,
        seconds7d: secs.get(u._id) ?? 0,
      }));
    return { users: list, total: all.length };
  });

  app.get("/admin/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const u = (await users().findOne({ _id: id }, { projection: { passwordHash: 0 } })) as User | null;
    if (!u) return reply.code(404).send({ error: "not_found" });
    const since = dayKey(new Date(Date.now() - 29 * DAY));
    const [conns, usage, rep, resp, mons, tasks, chatN, msgN, sent] = await Promise.all([
      connections().find({ userId: id }).project({ platform: 1, status: 1, displayName: 1, lastError: 1, updatedAt: 1 }).toArray(),
      usageDaily().aggregate<{ _id: string; seconds: number; views: number }>([{ $match: { userId: id, day: { $gte: since } } }, { $group: { _id: "$section", seconds: { $sum: "$seconds" }, views: { $sum: "$views" } } }, { $sort: { seconds: -1 } }]).toArray(),
      reports().find({ userId: id }).sort({ createdAt: -1 }).limit(20).toArray(),
      responders().countDocuments({ userId: id }),
      monitors().countDocuments({ userId: id }),
      scheduledTasks().countDocuments({ userId: id }),
      chats().countDocuments({ userId: id }),
      chatMessages().countDocuments({ userId: id, role: "user" }),
      autoReplies().countDocuments({ userId: id, replied: true }),
    ]);
    return {
      user: {
        id: u._id,
        email: u.email,
        name: u.name || null,
        verified: u.emailVerified,
        plan: planLabel(u),
        timezone: u.timezone,
        createdAt: u.createdAt,
        lastSeenAt: u.lastSeenAt ?? null,
        lastSection: u.lastSection ?? null,
        trialEndsAt: u.trialEndsAt ?? null,
        currentPeriodEnd: u.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: Boolean(u.cancelAtPeriodEnd),
      },
      connections: conns.map((c: any) => ({ id: c._id, platform: c.platform, status: c.status, displayName: c.displayName, lastError: c.lastError, updatedAt: c.updatedAt })),
      usage: usage.map((x) => ({ section: x._id, seconds: x.seconds, views: x.views })),
      counts: { autoReplies: resp, monitors: mons, schedules: tasks, chats: chatN, questionsAsked: msgN, autoRepliesSent: sent },
      reports: rep.map((r) => reportView(r)),
    };
  });

  // ---------- usage ----------
  app.get("/admin/usage", { preHandler: requireAdmin }, async (req) => {
    const n = (req.query as { days?: string }).days === "7" ? 7 : 30;
    const days = lastDays(n);
    const rows = await usageDaily().find({ day: { $gte: days[0] } }).toArray();
    const sec = new Map<string, { views: number; seconds: number; users: Set<string> }>();
    const userDays = new Set<string>();
    const dau = new Map<string, Set<string>>();
    const activeUsers = new Set<string>();
    let totalSeconds = 0;
    let totalViews = 0;
    for (const r of rows) {
      const s = sec.get(r.section) ?? { views: 0, seconds: 0, users: new Set<string>() };
      s.views += r.views;
      s.seconds += r.seconds;
      s.users.add(r.userId);
      sec.set(r.section, s);
      userDays.add(`${r.userId}|${r.day}`);
      if (!dau.has(r.day)) dau.set(r.day, new Set());
      dau.get(r.day)!.add(r.userId);
      activeUsers.add(r.userId);
      totalSeconds += r.seconds;
      totalViews += r.views;
    }
    const verified = await users().countDocuments({ emailVerified: true });
    const [withConn, withResp, withMon, withTask, withChat] = await Promise.all([
      connections().distinct("userId", { status: "connected" }),
      responders().distinct("userId", { active: true }),
      monitors().distinct("userId", {}),
      scheduledTasks().distinct("userId", {}),
      chats().distinct("userId", {}),
    ]);
    const questions = await perDay(chatMessages(), "createdAt", days, { role: "user" });
    return {
      days,
      sections: [...sec.entries()].map(([section, s]) => ({ section, views: s.views, seconds: s.seconds, users: s.users.size })).sort((a, b) => b.seconds - a.seconds || b.views - a.views),
      dau: days.map((d) => dau.get(d)?.size ?? 0),
      questions,
      activeUsers: activeUsers.size,
      avgSecondsPerActiveDay: userDays.size ? Math.round(totalSeconds / userDays.size) : 0,
      avgViewsPerActiveDay: userDays.size ? Math.round((totalViews / userDays.size) * 10) / 10 : 0,
      adoption: {
        base: verified,
        connected: withConn.length,
        autoReply: withResp.length,
        monitor: withMon.length,
        schedule: withTask.length,
        chat: withChat.length,
      },
    };
  });

  // ---------- channels ----------
  app.get("/admin/channels", { preHandler: requireAdmin }, async () => {
    const days = lastDays(14);
    const since30 = new Date(Date.now() - 30 * DAY);
    const conns = await connections().find({}).project({ userId: 1, platform: 1, status: 1, lastError: 1, updatedAt: 1, displayName: 1 }).toArray();
    const emails = new Map((await users().find({}).project({ email: 1 }).toArray()).map((u: any) => [u._id, u.email]));
    const byPlatform: Record<string, Record<string, number>> = {};
    for (const c of conns as any[]) {
      byPlatform[c.platform] ??= {};
      byPlatform[c.platform][c.status] = (byPlatform[c.platform][c.status] ?? 0) + 1;
    }
    const perPlatform: Record<string, number[]> = {};
    for (const p of ["whatsapp", "telegram", "slack"]) perPlatform[p] = await perDay(channelMessages(), "occurredAt", days, { platform: p, direction: "inbound" });
    const [sent, silent, live, monActive, sends, sendFails] = await Promise.all([
      autoReplies().countDocuments({ replied: true, createdAt: { $gte: since30 } }),
      autoReplies().countDocuments({ replied: false, createdAt: { $gte: since30 } }),
      responders().countDocuments({ active: true }),
      monitors().countDocuments({ active: true }),
      outbound().countDocuments({ status: "sent", createdAt: { $gte: since30 } }),
      outbound().countDocuments({ status: "failed", createdAt: { $gte: since30 } }),
    ]);
    const alerts = await monitors().find({ lastResult: { $regex: "^(Matched|Arrived|Absence alert)" } }).sort({ lastCheckedAt: -1 }).limit(10).toArray();
    return {
      byPlatform,
      needsAttention: (conns as any[])
        .filter((c) => c.status === "error")
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
        .map((c) => ({ id: c._id, platform: c.platform, email: emails.get(c.userId) ?? "?", userId: c.userId, lastError: c.lastError, updatedAt: c.updatedAt })),
      messages: { days, ...perPlatform },
      autoReplies: { sent, silent, live },
      monitors: { active: monActive, // Title and owner only: the alert summary quotes the user's chat, which admins don't see.
      recentAlerts: alerts.map((m) => ({ id: m._id, title: m.title, email: emails.get(m.userId) ?? "?", at: m.lastCheckedAt })) },
      sends: { sent: sends, failed: sendFails },
    };
  });

  // ---------- revenue ----------
  app.get("/admin/revenue", { preHandler: requireAdmin }, async () => {
    const all = (await users().find({}).project({ passwordHash: 0 }).toArray()) as User[];
    const now = Date.now();
    const paying = all.filter(isPaying);
    const started = all.filter((u) => u.trialStartedAt);
    const converted = started.filter(isPaying);
    const count = (fn: (u: User) => boolean) => all.filter(fn).length;
    return {
      mrr: mrrOf(all),
      plans: {
        pro: paying.filter((u) => u.plan !== "starter").length,
        starter: paying.filter((u) => u.plan === "starter").length,
        comp: count((u) => Boolean(u.compAccess)),
        trial: count((u) => u.subscriptionStatus === "trialing" && !trialExpired(u)),
        trialEnded: count((u) => trialExpired(u)),
        pastDue: count((u) => u.subscriptionStatus === "past_due"),
        canceled: count((u) => u.subscriptionStatus === "canceled"),
        none: count((u) => !u.compAccess && (!u.subscriptionStatus || u.subscriptionStatus === "none")),
      },
      prices: { starter: PLANS.starter.priceUsd, pro: PLANS.pro.priceUsd },
      conversion: { trialsStarted: started.length, converted: converted.length },
      cancelling: paying.filter((u) => u.cancelAtPeriodEnd).map((u) => ({ id: u._id, email: u.email, plan: u.plan, until: u.currentPeriodEnd })),
      trialsEndingSoon: all
        .filter((u) => u.subscriptionStatus === "trialing" && u.trialEndsAt && +new Date(u.trialEndsAt) > now && +new Date(u.trialEndsAt) - now < DAY)
        .map((u) => ({ id: u._id, email: u.email, endsAt: u.trialEndsAt })),
      subscribers: paying
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
        .map((u) => ({ id: u._id, email: u.email, plan: u.plan === "starter" ? "Starter" : "Pro", renews: u.currentPeriodEnd ?? null, cancelling: Boolean(u.cancelAtPeriodEnd) })),
    };
  });

  // ---------- reports ----------
  app.get("/admin/reports", { preHandler: requireAdmin }, async (req) => {
    const status = (req.query as { status?: string }).status;
    const match = status && ["open", "in_progress", "resolved"].includes(status) ? { status } : {};
    const [rows, counts] = await Promise.all([
      reports().find(match as any).project({ screenshot: 0 }).sort({ createdAt: -1 }).limit(200).toArray(),
      reports().aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    ]);
    return {
      reports: rows.map((r: any) => ({ ...reportView({ ...r, screenshot: null }), hasScreenshot: false, userId: r.userId, email: r.email, name: r.name })),
      counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    };
  });

  app.get("/admin/reports/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const r = await reports().findOne({ _id: (req.params as { id: string }).id });
    if (!r) return reply.code(404).send({ error: "not_found" });
    return { report: { ...reportView(r, true), userId: r.userId, email: r.email, name: r.name, context: r.context } };
  });

  app.patch("/admin/reports/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const parsed = z.object({ status: z.enum(["open", "in_progress", "resolved"]).optional(), adminReply: z.string().trim().max(5000).nullable().optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const r = await reports().findOne({ _id: (req.params as { id: string }).id });
    if (!r) return reply.code(404).send({ error: "not_found" });
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now };
    if (parsed.data.status) {
      set.status = parsed.data.status;
      set.resolvedAt = parsed.data.status === "resolved" ? now : null;
    }
    const newReply = parsed.data.adminReply !== undefined && (parsed.data.adminReply || null) !== r.adminReply;
    if (parsed.data.adminReply !== undefined) set.adminReply = parsed.data.adminReply || null;
    await reports().updateOne({ _id: r._id }, { $set: set });

    // Tell the user when we reply or fix it (best-effort).
    const resolvedNow = parsed.data.status === "resolved" && r.status !== "resolved";
    if ((newReply && parsed.data.adminReply) || resolvedNow) {
      const lines = [
        `Hi${r.name ? ` ${r.name.split(" ")[0]}` : ""},`,
        "",
        resolvedNow ? `We've marked your report "${r.title}" as resolved.` : `We've replied to your report "${r.title}".`,
        ...(parsed.data.adminReply ? ["", parsed.data.adminReply] : []),
        "",
        "You can see it any time under Report a problem in your RelayFlow dashboard.",
        "",
        "The RelayFlow team",
      ];
      sendEmail(r.email, `Update on your report: ${r.title}`, lines.join("\n")).catch((e) => console.error(`[reports] user email failed: ${(e as Error).message}`));
    }
    const updated = await reports().findOne({ _id: r._id });
    return { report: { ...reportView(updated!, true), userId: r.userId, email: r.email, name: r.name, context: r.context } };
  });
}
