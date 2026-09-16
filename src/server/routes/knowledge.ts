import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { knowledgeBase, knowledgeDocs, autoReplies, connections, destinations } from "../db";
import { uid } from "../lib/crypto";
import { requireActivePlan } from "../auth/context";
import { setGuardrails } from "../knowledge/knowledge";

export async function knowledgeRoutes(app: FastifyInstance) {
  // Everything the Knowledge tab needs in one call.
  app.get("/knowledge", { preHandler: requireActivePlan }, async (req) => {
    const userId = req.userId!;
    const kb = await knowledgeBase().findOne({ _id: userId });
    const docs = await knowledgeDocs().find({ userId }).sort({ createdAt: -1 }).toArray();
    const conns = await connections().find({ userId, status: "connected" }).toArray();
    const recent = await autoReplies().find({ userId }).sort({ createdAt: -1 }).limit(25).toArray();

    // Each connected platform, with its individual groups/channels the user can toggle.
    const channels = [];
    for (const c of conns) {
      const dests = await destinations().find({ connectionId: c._id }).sort({ name: 1 }).toArray();
      channels.push({
        connectionId: c._id,
        platform: c.platform,
        displayName: c.displayName,
        destinations: dests.map((d) => ({ id: d._id, externalId: d.externalId, name: d.name, kind: d.kind, autoReplyEnabled: Boolean(d.autoReplyEnabled) })),
      });
    }

    return {
      guardrails: kb?.guardrails || "",
      docs: docs.map((d) => ({ id: d._id, title: d.title, source: d.source, chars: d.chars, createdAt: d.createdAt })),
      channels,
      recent: recent.map((r) => ({
        id: r._id, platform: r.platform, destination: r.destinationName, from: r.incomingFrom,
        incoming: r.incomingText, replied: r.replied, replyText: r.replyText, reason: r.reason, at: r.createdAt,
      })),
    };
  });

  app.put("/knowledge/guardrails", { preHandler: requireActivePlan }, async (req, reply) => {
    const parsed = z.object({ guardrails: z.string().max(5000) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    await setGuardrails(req.userId!, parsed.data.guardrails);
    return { status: "ok" };
  });

  // Add a knowledge document — typed text, or a base64-encoded PDF we extract text from.
  app.post("/knowledge/docs", { preHandler: requireActivePlan }, async (req, reply) => {
    const parsed = z
      .object({
        title: z.string().min(1).max(160),
        source: z.enum(["text", "pdf"]),
        text: z.string().max(200_000).optional(),
        dataBase64: z.string().max(12_000_000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", detail: parsed.error.issues[0]?.message });

    let text = (parsed.data.text || "").trim();
    if (parsed.data.source === "pdf") {
      if (!parsed.data.dataBase64) return reply.code(400).send({ error: "invalid_input", detail: "Missing PDF data." });
      try {
        const buf = Buffer.from(parsed.data.dataBase64, "base64");
        const mod: any = await import("pdf-parse");
        const pdfParse = mod.default || mod;
        const out = await pdfParse(buf);
        text = String(out.text || "").replace(/\n{3,}/g, "\n\n").trim();
      } catch (error) {
        return reply.code(400).send({ error: "pdf_failed", detail: `Couldn't read that PDF: ${(error as Error).message}` });
      }
    }
    if (!text) return reply.code(400).send({ error: "empty", detail: "No text found to add." });

    const doc = {
      _id: uid(), userId: req.userId!, title: parsed.data.title.trim(),
      source: parsed.data.source, text: text.slice(0, 200_000), chars: text.length, createdAt: new Date(),
    };
    await knowledgeDocs().insertOne(doc);
    return { doc: { id: doc._id, title: doc.title, source: doc.source, chars: doc.chars, createdAt: doc.createdAt } };
  });

  app.delete("/knowledge/docs/:id", { preHandler: requireActivePlan }, async (req) => {
    const { id } = req.params as { id: string };
    await knowledgeDocs().deleteOne({ _id: id, userId: req.userId! });
    return { status: "ok" };
  });

  // Turn auto-reply on/off for a SPECIFIC group/channel (destination).
  app.patch("/knowledge/auto-reply", { preHandler: requireActivePlan }, async (req, reply) => {
    const parsed = z.object({ destinationId: z.string(), enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const set: Record<string, unknown> = {
      autoReplyEnabled: parsed.data.enabled,
      // Reset the watermark to "now" when enabling, so we only answer messages from here on.
      autoReplyLastSeenAt: parsed.data.enabled ? new Date() : null,
      updatedAt: new Date(),
    };
    // Enabling auto-reply on a group also marks it "in scope" so its messages are read.
    if (parsed.data.enabled) set.selected = true;
    await destinations().updateOne({ _id: parsed.data.destinationId, userId: req.userId! }, { $set: set });
    return { status: "ok" };
  });
}
