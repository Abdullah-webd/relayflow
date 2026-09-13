import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { monitors } from "../db";
import { uid } from "../lib/crypto";
import { requireActivePlan } from "../auth/context";
import { MIN_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES } from "../monitors";

export async function monitorRoutes(app: FastifyInstance) {
  app.get("/monitors", { preHandler: requireActivePlan }, async (req) => {
    const rows = await monitors().find({ userId: req.userId! }).sort({ createdAt: -1 }).toArray();
    return {
      monitors: rows.map((m) => ({
        id: m._id,
        title: m.title,
        platform: m.platform,
        group: m.group,
        condition: m.condition,
        mode: m.mode,
        intervalMinutes: m.intervalMinutes,
        active: m.active,
        lastCheckedAt: m.lastCheckedAt,
        lastResult: m.lastResult,
        absenceDeadline: m.absenceDeadline,
      })),
    };
  });

  app.post("/monitors", { preHandler: requireActivePlan }, async (req, reply) => {
    const body = z
      .object({
        title: z.string().min(1).max(120),
        platform: z.enum(["whatsapp", "telegram", "slack", "gmail"]),
        group: z.string().max(200).nullable().optional(),
        condition: z.string().min(1).max(1000),
        mode: z.enum(["match", "absence"]).default("match"),
        intervalMinutes: z.number().int().min(1).max(1440).optional(),
        absenceHours: z.number().min(0.25).max(720).nullable().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input", detail: body.error.issues[0]?.message });

    const now = new Date();
    const intervalMinutes = Math.max(MIN_INTERVAL_MINUTES, body.data.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES);
    const absenceDeadline =
      body.data.mode === "absence" && body.data.absenceHours
        ? new Date(now.getTime() + body.data.absenceHours * 3_600_000)
        : null;

    const monitor = {
      _id: uid(),
      userId: req.userId!,
      title: body.data.title,
      platform: body.data.platform,
      group: body.data.group ?? null,
      condition: body.data.condition,
      mode: body.data.mode,
      intervalMinutes,
      active: true,
      lastCheckedAt: null,
      lastSeenAt: now, // only watch messages that arrive AFTER creation
      absenceDeadline,
      expiresAt: null,
      notified: [],
      lastResult: null,
      createdAt: now,
      updatedAt: now,
    };
    await monitors().insertOne(monitor);
    return { monitor: { ...monitor, id: monitor._id } };
  });

  app.patch("/monitors/:id", { preHandler: requireActivePlan }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ active: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    await monitors().updateOne({ _id: id, userId: req.userId! }, { $set: { active: body.data.active, updatedAt: new Date() } });
    return { status: "ok" };
  });

  app.delete("/monitors/:id", { preHandler: requireActivePlan }, async (req) => {
    const { id } = req.params as { id: string };
    await monitors().deleteOne({ _id: id, userId: req.userId! });
    return { status: "ok" };
  });
}
