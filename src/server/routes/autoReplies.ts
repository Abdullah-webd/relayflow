import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { knowledgeDocs, autoReplies, connections, destinations, responders, type Responder } from "../db";
import { uid } from "../lib/crypto";
import { requireActivePlan } from "../auth/context";
import { ensureLegacyResponder, getResponderContext, syncResponderDestinations } from "../knowledge/knowledge";
import { decideReply } from "../knowledge/autoReply";
import { requireProFeature } from "../billing/access";

const MAX_RESPONDERS = 25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const docView = (d: { _id: string; title: string; source: string; chars: number; createdAt: Date }) => ({
  id: d._id,
  title: d.title,
  source: d.source,
  chars: d.chars,
  createdAt: d.createdAt,
});

async function ownResponder(req: FastifyRequest, reply: FastifyReply): Promise<Responder | null> {
  const { id } = req.params as { id: string };
  const r = await responders().findOne({ _id: id, userId: req.userId! });
  if (!r) void reply.code(404).send({ error: "not_found", detail: "That auto-reply doesn't exist any more." });
  return r;
}

/** Runs requireProFeature inline; returns false (reply already sent) when the plan doesn't include it. */
async function proOnly(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  await requireProFeature(req, reply);
  return !reply.sent;
}

export async function autoReplyRoutes(app: FastifyInstance) {
  // Everything the Auto-replies screens need in one call.
  app.get("/auto-replies", { preHandler: requireActivePlan }, async (req) => {
    const userId = req.userId!;
    await ensureLegacyResponder(userId);
    const [rows, docs, conns, recent] = await Promise.all([
      responders().find({ userId }).sort({ createdAt: 1 }).toArray(),
      knowledgeDocs().find({ userId }).project({ text: 0 }).sort({ createdAt: -1 }).toArray(),
      connections().find({ userId, status: "connected" }).toArray(),
      autoReplies().find({ userId }).sort({ createdAt: -1 }).limit(60).toArray(),
    ]);
    const since = new Date(Date.now() - WEEK_MS);
    const stats = await autoReplies()
      .aggregate<{ _id: { r: string | null; replied: boolean }; n: number; last: Date }>([
        { $match: { userId, createdAt: { $gte: since } } },
        { $group: { _id: { r: "$responderId", replied: "$replied" }, n: { $sum: 1 }, last: { $max: "$createdAt" } } },
      ])
      .toArray();

    const channels = [];
    for (const c of conns) {
      const dests = await destinations().find({ connectionId: c._id, userId }).sort({ name: 1 }).toArray();
      channels.push({
        connectionId: c._id,
        platform: c.platform,
        displayName: c.displayName,
        destinations: dests.map((d) => ({ id: d._id, name: d.name, kind: d.kind })),
      });
    }

    return {
      responders: rows.map((r) => {
        const mine = stats.filter((s) => s._id.r === r._id);
        const sent = mine.find((s) => s._id.replied);
        return {
          id: r._id,
          name: r.name,
          active: r.active,
          instructions: r.instructions,
          destinationIds: r.destinationIds,
          docs: docs.filter((d) => d.responderId === r._id).map((d) => docView(d as any)),
          stats: {
            sent7d: sent?.n ?? 0,
            silent7d: mine.find((s) => !s._id.replied)?.n ?? 0,
            lastReplyAt: sent?.last ?? null,
          },
        };
      }),
      channels,
      recent: recent.map((r) => ({
        id: r._id,
        responderId: r.responderId ?? null,
        responderName: r.responderName ?? null,
        platform: r.platform,
        destination: r.destinationName,
        from: r.incomingFrom,
        incoming: r.incomingText,
        replied: r.replied,
        replyText: r.replyText,
        reason: r.reason,
        at: r.createdAt,
      })),
    };
  });

  app.post("/auto-replies", { preHandler: [requireActivePlan, requireProFeature] }, async (req, reply) => {
    const parsed = z.object({ name: z.string().trim().min(1).max(80), instructions: z.string().max(5000).optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", detail: "Give the auto-reply a name." });
    const userId = req.userId!;
    if ((await responders().countDocuments({ userId })) >= MAX_RESPONDERS)
      return reply.code(400).send({ error: "limit", detail: `You can have up to ${MAX_RESPONDERS} auto-replies.` });
    const now = new Date();
    const r: Responder = {
      _id: uid(),
      userId,
      name: parsed.data.name,
      active: false, // goes live once it has groups and knowledge
      instructions: parsed.data.instructions ?? "",
      destinationIds: [],
      createdAt: now,
      updatedAt: now,
    };
    await responders().insertOne(r);
    return { responder: { id: r._id } };
  });

  app.patch("/auto-replies/:id", { preHandler: requireActivePlan }, async (req, reply) => {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        instructions: z.string().max(5000).optional(),
        active: z.boolean().optional(),
        destinationIds: z.array(z.string()).max(500).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", detail: parsed.error.issues[0]?.message });
    const body = parsed.data;
    const r = await ownResponder(req, reply);
    if (!r) return reply;
    // Pausing is always allowed (even after a downgrade); everything else is Pro.
    const onlyPausing = body.active === false && Object.keys(body).length === 1;
    if (!onlyPausing && !(await proOnly(req, reply))) return reply;

    const userId = req.userId!;
    const set: Partial<Responder> = { updatedAt: new Date() };
    if (body.name !== undefined) set.name = body.name;
    if (body.instructions !== undefined) set.instructions = body.instructions;

    let destinationIds = r.destinationIds;
    if (body.destinationIds) {
      const unique = [...new Set(body.destinationIds)];
      const owned = await destinations().find({ _id: { $in: unique }, userId }).project({ _id: 1 }).toArray();
      destinationIds = owned.map((d) => d._id);
      set.destinationIds = destinationIds;
    }
    if (body.active !== undefined) set.active = body.active;

    const willBeActive = set.active ?? r.active;
    if (willBeActive) {
      if (destinationIds.length === 0)
        return reply.code(400).send({ error: "needs_groups", detail: "Choose at least one group for this auto-reply to answer in." });
      if ((await knowledgeDocs().countDocuments({ responderId: r._id }, { limit: 1 })) === 0)
        return reply.code(400).send({ error: "needs_knowledge", detail: "Add some knowledge first. It only answers from your own facts." });
    }

    await responders().updateOne({ _id: r._id }, { $set: set });
    // A group is answered by one auto-reply only: claiming it here releases it elsewhere.
    if (body.destinationIds && destinationIds.length) {
      await responders().updateMany({ userId, _id: { $ne: r._id } }, { $pull: { destinationIds: { $in: destinationIds } } as any, $set: { updatedAt: new Date() } });
    }
    await syncResponderDestinations(userId);
    return { status: "ok" };
  });

  app.delete("/auto-replies/:id", { preHandler: requireActivePlan }, async (req, reply) => {
    const r = await ownResponder(req, reply);
    if (!r) return reply;
    await responders().deleteOne({ _id: r._id });
    await knowledgeDocs().deleteMany({ responderId: r._id, userId: req.userId! });
    await syncResponderDestinations(req.userId!);
    return { status: "ok" };
  });

  // Add knowledge to one auto-reply: typed text, or a base64-encoded PDF we extract text from.
  app.post("/auto-replies/:id/docs", { preHandler: [requireActivePlan, requireProFeature] }, async (req, reply) => {
    const parsed = z
      .object({
        title: z.string().trim().min(1).max(160),
        source: z.enum(["text", "pdf"]),
        text: z.string().max(200_000).optional(),
        dataBase64: z.string().max(12_000_000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", detail: "Give it a title and some text." });
    const r = await ownResponder(req, reply);
    if (!r) return reply;

    let text = (parsed.data.text || "").trim();
    if (parsed.data.source === "pdf") {
      if (!parsed.data.dataBase64) return reply.code(400).send({ error: "invalid_input", detail: "Missing PDF data." });
      try {
        const mod: any = await import("pdf-parse");
        const pdfParse = mod.default || mod;
        const out = await pdfParse(Buffer.from(parsed.data.dataBase64, "base64"));
        text = String(out.text || "").replace(/\n{3,}/g, "\n\n").trim();
      } catch (error) {
        return reply.code(400).send({ error: "pdf_failed", detail: `Couldn't read that PDF: ${(error as Error).message}` });
      }
    }
    if (!text) return reply.code(400).send({ error: "empty", detail: "No text found to add." });

    const doc = {
      _id: uid(),
      userId: req.userId!,
      responderId: r._id,
      title: parsed.data.title,
      source: parsed.data.source,
      text: text.slice(0, 200_000),
      chars: text.length,
      createdAt: new Date(),
    };
    await knowledgeDocs().insertOne(doc);
    return { doc: docView(doc) };
  });

  app.delete("/auto-replies/:id/docs/:docId", { preHandler: requireActivePlan }, async (req, reply) => {
    const r = await ownResponder(req, reply);
    if (!r) return reply;
    const { docId } = req.params as { docId: string };
    await knowledgeDocs().deleteOne({ _id: docId, responderId: r._id, userId: req.userId! });
    return { status: "ok" };
  });

  // Dry run: what would this auto-reply say to a customer message? Nothing is sent.
  app.post(
    "/auto-replies/:id/try",
    { preHandler: [requireActivePlan, requireProFeature], config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const parsed = z.object({ message: z.string().trim().min(1).max(1000) }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_input", detail: "Type a message to try." });
      const r = await ownResponder(req, reply);
      if (!r) return reply;
      const { guardrails, text, hasContent } = await getResponderContext(r);
      if (!hasContent) return { reply: false, answer: "", reason: "It has no knowledge yet, so it would stay silent." };
      return decideReply(guardrails, text, "A customer", parsed.data.message);
    },
  );
}
