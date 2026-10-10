import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { connections, reports, usageDaily, users, type Report } from "../db";
import { requireAuth } from "../auth/context";
import { uid } from "../lib/crypto";
import { sendEmail } from "../lib/email";
import { env } from "../env";
import { effectivePlan, effectiveStatus } from "../billing/plans";

export const SECTIONS = ["overview", "chat", "auto-replies", "monitors", "schedules", "connections", "settings", "reports"] as const;
const CATEGORIES = ["bug", "connection", "billing", "feature", "other"] as const;
export const CATEGORY_LABEL: Record<string, string> = { bug: "Something isn't working", connection: "Channel connection", billing: "Billing or plan", feature: "Feature request", other: "Something else" };
const MAX_SCREENSHOT = 2_500_000; // characters of data URL (the browser resizes before upload)

export const reportView = (r: Report, withScreenshot = false) => ({
  id: r._id,
  category: r.category,
  title: r.title,
  description: r.description,
  page: r.page,
  status: r.status,
  adminReply: r.adminReply,
  hasScreenshot: Boolean(r.screenshot),
  ...(withScreenshot ? { screenshot: r.screenshot } : {}),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  resolvedAt: r.resolvedAt,
});

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export async function reportRoutes(app: FastifyInstance) {
  // Any signed-in user can report, including after their trial ends (billing problems are reports too).
  app.post("/reports", { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const parsed = z
      .object({
        category: z.enum(CATEGORIES),
        title: z.string().trim().min(3).max(140),
        description: z.string().trim().min(10).max(5000),
        page: z.enum(SECTIONS).nullable().optional(),
        screenshot: z.string().max(MAX_SCREENSHOT).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).nullable().optional(),
        viewport: z.string().max(40).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] || "");
      const detail =
        field === "title" ? "Give the problem a short title (at least 3 characters)."
        : field === "description" ? "Describe what happened (at least 10 characters)."
        : field === "screenshot" ? "That screenshot couldn't be attached. Try a smaller PNG or JPEG."
        : "Please check the form and try again.";
      return reply.code(400).send({ error: "invalid_input", detail });
    }
    const user = await users().findOne({ _id: req.userId! });
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const conns = await connections().find({ userId: user._id }).toArray();
    const now = new Date();
    const r: Report = {
      _id: uid(),
      userId: user._id,
      email: user.email,
      name: user.name || null,
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      page: parsed.data.page ?? null,
      screenshot: parsed.data.screenshot ?? null,
      context: {
        userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
        viewport: parsed.data.viewport || "",
        plan: `${effectivePlan(user)} (${effectiveStatus(user)})`,
        channels: conns.map((c) => `${c.platform}: ${c.status}`),
      },
      status: "open",
      adminReply: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    await reports().insertOne(r);

    // Let the owner know straight away (best-effort; the console shows it live either way).
    if (env.adminEmail) {
      sendEmail(
        env.adminEmail,
        `New RelayFlow report: ${r.title}`,
        `${user.email} reported (${CATEGORY_LABEL[r.category]}${r.page ? `, ${r.page} tab` : ""}):\n\n${r.title}\n\n${r.description}\n\nOpen the admin console to reply: ${env.webBaseUrl || "https://userelayflow.com"}/admin/reports`,
      ).catch((e) => console.error(`[reports] admin email failed: ${(e as Error).message}`));
    }
    return { report: reportView(r) };
  });

  app.get("/reports", { preHandler: requireAuth }, async (req) => {
    const rows = await reports().find({ userId: req.userId! }).sort({ createdAt: -1 }).limit(50).toArray();
    return { reports: rows.map((r) => reportView(r)) };
  });

  // Dashboard heartbeat: which tab is open, and for how long (sent every 30s while visible).
  app.post("/track", { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z.object({ section: z.enum(SECTIONS), seconds: z.number().int().min(0).max(60) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const { section, seconds } = parsed.data;
    const userId = req.userId!;
    const now = new Date();
    const day = dayKey(now);
    await Promise.all([
      usageDaily().updateOne(
        { _id: `${userId}|${day}|${section}` },
        { $inc: { views: seconds === 0 ? 1 : 0, seconds }, $set: { updatedAt: now }, $setOnInsert: { userId, day, section } },
        { upsert: true },
      ),
      users().updateOne({ _id: userId }, { $set: { lastSeenAt: now, lastSection: section } }),
    ]);
    return { ok: true };
  });
}
