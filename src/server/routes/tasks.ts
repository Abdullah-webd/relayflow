import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { scheduledTasks, users } from "../db";
import { uid } from "../lib/crypto";
import { requireActivePlan } from "../auth/context";

export async function taskRoutes(app: FastifyInstance) {
  app.get("/tasks", { preHandler: requireActivePlan }, async (req) => {
    const rows = await scheduledTasks().find({ userId: req.userId! }).sort({ runAt: 1 }).toArray();
    return {
      tasks: rows.map((t) => ({
        id: t._id,
        title: t.title,
        instruction: t.instruction,
        schedule: t.schedule,
        runAt: t.runAt,
        active: t.active,
        lastRunAt: t.lastRunAt,
        lastResult: t.lastResult,
      })),
    };
  });

  app.post("/tasks", { preHandler: requireActivePlan }, async (req, reply) => {
    const body = z
      .object({
        title: z.string().min(1).max(120),
        instruction: z.string().min(1).max(2000),
        schedule: z.enum(["once", "daily", "weekly"]),
        runAt: z.string(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input", detail: body.error.issues[0]?.message });
    const runAt = new Date(body.data.runAt);
    if (Number.isNaN(runAt.getTime())) return reply.code(400).send({ error: "invalid_input", detail: "Invalid run time." });
    const user = await users().findOne({ _id: req.userId! });
    const now = new Date();
    const task = {
      _id: uid(),
      userId: req.userId!,
      title: body.data.title,
      instruction: body.data.instruction,
      schedule: body.data.schedule,
      runAt,
      timezone: user?.timezone || "UTC",
      active: true,
      lastRunAt: null,
      lastResult: null,
      createdAt: now,
      updatedAt: now,
    };
    await scheduledTasks().insertOne(task);
    return { task: { ...task, id: task._id } };
  });

  app.patch("/tasks/:id", { preHandler: requireActivePlan }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ active: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    await scheduledTasks().updateOne({ _id: id, userId: req.userId! }, { $set: { active: body.data.active, updatedAt: new Date() } });
    return { status: "ok" };
  });

  app.delete("/tasks/:id", { preHandler: requireActivePlan }, async (req) => {
    const { id } = req.params as { id: string };
    await scheduledTasks().deleteOne({ _id: id, userId: req.userId! });
    return { status: "ok" };
  });
}
