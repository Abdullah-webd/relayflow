import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { chats, chatMessages, users } from "../db";
import { uid } from "../lib/crypto";
import { requireActivePlan } from "../auth/context";
import { env } from "../env";
import { tryConsumeCredits } from "../billing/stripe";
import { CREDITS_PER_MESSAGE } from "../billing/plans";
import { streamRun, acknowledgeAction } from "../agent/agent";
import { sendToTargets, type SendTarget } from "../connectors/manager";
import type { Platform } from "../db";

export async function chatRoutes(app: FastifyInstance) {
  app.get("/chats", { preHandler: requireActivePlan }, async (req) => {
    const userId = req.userId!;
    const rows = await chats().find({ userId }).sort({ updatedAt: -1 }).limit(100).toArray();
    // Latest message per chat, for a ChatGPT-style preview line under each title.
    const latest = await chatMessages()
      .aggregate<{ _id: string; content: string; role: string }>([
        { $match: { userId } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$chatId", content: { $first: "$content" }, role: { $first: "$role" } } },
      ])
      .toArray();
    const clean = (s: string) =>
      (s || "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // markdown links → text
        .replace(/[*_`#>~]/g, "") // drop md emphasis/heading/quote markers
        .replace(/\s+/g, " ")
        .trim();
    const previewById = new Map(latest.map((m) => [m._id, `${m.role === "assistant" ? "" : "You: "}${clean(m.content)}`]));
    return {
      chats: rows.map((c) => ({
        id: c._id,
        title: c.title,
        updatedAt: c.updatedAt,
        preview: (previewById.get(c._id) || "").slice(0, 100),
      })),
    };
  });

  app.post("/chats", { preHandler: requireActivePlan }, async (req) => {
    const now = new Date();
    const chat = { _id: uid(), userId: req.userId!, title: "New chat", lastResponseId: null, createdAt: now, updatedAt: now };
    await chats().insertOne(chat);
    return { chat: { id: chat._id, title: chat.title, updatedAt: chat.updatedAt } };
  });

  app.get("/chats/:id", { preHandler: requireActivePlan }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const chat = await chats().findOne({ _id: id, userId: req.userId! });
    if (!chat) return reply.code(404).send({ error: "not_found" });
    const messages = await chatMessages().find({ chatId: id }).sort({ createdAt: 1 }).toArray();
    return {
      chat: { id: chat._id, title: chat.title },
      messages: messages.map((m) => ({ id: m._id, role: m.role, content: m.content, toolResults: m.toolResults ?? [], resolvedActions: m.resolvedActions ?? [], createdAt: m.createdAt })),
    };
  });

  app.patch("/chats/:id", { preHandler: requireActivePlan }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ title: z.string().min(1).max(120) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    await chats().updateOne({ _id: id, userId: req.userId! }, { $set: { title: body.data.title, updatedAt: new Date() } });
    return { status: "ok" };
  });

  app.delete("/chats/:id", { preHandler: requireActivePlan }, async (req) => {
    const { id } = req.params as { id: string };
    await chats().deleteOne({ _id: id, userId: req.userId! });
    await chatMessages().deleteMany({ chatId: id, userId: req.userId! });
    return { status: "ok" };
  });

  // Persist an approval outcome so a refresh doesn't show the Approve button again.
  app.post("/chats/:id/resolve", { preHandler: requireActivePlan }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z
      .object({ messageId: z.string().min(1), key: z.string().min(1).max(400), state: z.string().max(40), text: z.string().max(400) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    await chatMessages().updateOne(
      { _id: body.data.messageId, chatId: id, userId: req.userId! },
      {
        // Drop any prior resolution for this key, then record the new one.
        $pull: { resolvedActions: { key: body.data.key } } as any,
      },
    );
    await chatMessages().updateOne(
      { _id: body.data.messageId, chatId: id, userId: req.userId! },
      { $push: { resolvedActions: { key: body.data.key, state: body.data.state, text: body.data.text } } as any },
    );
    return { status: "ok" };
  });

  app.post("/chats/:id/stream", { preHandler: requireActivePlan }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ message: z.string().min(1).max(8000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const userId = req.userId!;
    const chat = await chats().findOne({ _id: id, userId });
    if (!chat) return reply.code(404).send({ error: "not_found" });

    // Each agent turn costs credits. Consume up-front; refunded below if the run errors.
    if (env.stripe.enabled) {
      const paid = await tryConsumeCredits(userId, CREDITS_PER_MESSAGE);
      if (!paid) {
        return reply.code(402).send({ error: "insufficient_credits", detail: "You're out of AI credits. Upgrade your plan to keep going." });
      }
    }

    const message = body.data.message.trim();
    const now = new Date();
    await chatMessages().insertOne({ _id: uid(), chatId: id, userId, role: "user", content: message, createdAt: now });
    if (chat.title === "New chat") {
      await chats().updateOne({ _id: id }, { $set: { title: message.slice(0, 60) } });
    }

    reply.hijack();
    reply.raw.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const write = (obj: unknown) => reply.raw.write(JSON.stringify(obj) + "\n");

    const user = await users().findOne({ _id: userId });
    let finalText = "";
    let responseId: string | null = chat.lastResponseId;
    let toolResults: unknown[] = [];
    try {
      for await (const ev of streamRun(userId, message, chat.lastResponseId, user?.timezone || "UTC")) {
        if (ev.type === "activity") write({ type: "activity", phase: ev.phase, label: ev.label });
        else if (ev.type === "final") {
          finalText = ev.text;
          responseId = ev.responseId;
          toolResults = ev.toolResults;
        }
      }
      for (let i = 0; i < finalText.length; i += 120) write({ type: "text_delta", delta: finalText.slice(i, i + 120) });
      const assistantMessageId = uid();
      await chatMessages().insertOne({ _id: assistantMessageId, chatId: id, userId, role: "assistant", content: finalText, toolResults, createdAt: new Date() });
      await chats().updateOne({ _id: id }, { $set: { lastResponseId: responseId, updatedAt: new Date() } });
      // Send the DB id so the client can adopt it — approvals then persist against the
      // same id the message will have after a refresh.
      write({ type: "completed", toolResults, messageId: assistantMessageId });
    } catch (error) {
      console.error("[chat.stream]", (error as Error).message);
      // Refund the credit we charged up-front since the turn didn't complete.
      if (env.stripe.enabled) await users().updateOne({ _id: userId }, { $inc: { credits: CREDITS_PER_MESSAGE } }).catch(() => undefined);
      write({ type: "error", detail: "The agent could not complete this request. Please try again." });
    }
    reply.raw.end();
  });

  app.post("/chats/:id/confirm-send", { preHandler: requireActivePlan }, async (req, reply) => {
    const { id } = req.params as { id: string };
    console.log(`[confirm-send] HIT chat=${id.slice(-8)} keys=${Object.keys((req.body as any) || {}).join(",")}`);
    const body = z
      .object({
        content: z.string().min(1).max(8000),
        targets: z
          .array(
            z.object({
              platform: z.enum(["whatsapp", "telegram", "slack", "gmail"]),
              connectionId: z.string(),
              externalId: z.string(),
              name: z.string(),
            }),
          )
          .min(1)
          .max(200),
      })
      .safeParse(req.body);
    if (!body.success) {
      console.log("[confirm-send] INVALID body:", JSON.stringify(req.body).slice(0, 300));
      return reply.code(400).send({ error: "invalid_input", detail: body.error.issues[0]?.message });
    }
    const userId = req.userId!;
    const chat = await chats().findOne({ _id: id, userId });
    if (!chat) return reply.code(404).send({ error: "not_found" });

    console.log(`[confirm-send] chat=${id.slice(-8)} targets=${body.data.targets.length}:`, body.data.targets.map((t) => `${t.platform}/${t.name}`).join(", "));
    const results = await sendToTargets(userId, body.data.targets as SendTarget[], body.data.content);
    console.log(`[confirm-send] result:`, results.map((r) => `${r.destinationName}=${r.ok ? "OK" : r.error}`).join(", "));
    const okCount = results.filter((r) => r.ok).length;
    const detail = results.map((r) => `${r.destinationName}: ${r.ok ? "sent" : `FAILED (${r.error})`}`).join("; ");
    const uniqueNames = [...new Set(body.data.targets.map((t) => t.name))].join(", ");
    // Default confirmation (used even if the OpenAI acknowledgement call fails).
    let ackText =
      okCount === results.length
        ? `✅ Sent to ${okCount === 1 ? uniqueNames : `${okCount} destination${okCount === 1 ? "" : "s"} (${uniqueNames})`}.`
        : `⚠️ Sent to ${okCount}/${results.length}. ${detail}`;
    let newResponseId = chat.lastResponseId;
    // The message is already sent by this point — the acknowledgement is a nicety and
    // must never fail the request (which would mislead the user into thinking it failed).
    try {
      const note = `[System] The user approved sending the message "${body.data.content}". It has now been executed. ${okCount} of ${results.length} destination(s) delivered. Details: ${detail}. Confirm to the user clearly whether it was sent and to which destination(s).`;
      const ack = await acknowledgeAction(chat.lastResponseId, note);
      if (ack.text?.trim()) ackText = ack.text;
      newResponseId = ack.responseId;
    } catch (error) {
      console.error("[confirm-send] acknowledgement failed (send still went through):", (error as Error).message);
    }
    await chatMessages().insertOne({
      _id: uid(),
      chatId: id,
      userId,
      role: "assistant",
      content: ackText,
      toolResults: [{ name: "send", result: { status: "done", results } }],
      createdAt: new Date(),
    });
    await chats().updateOne({ _id: id }, { $set: { lastResponseId: newResponseId, updatedAt: new Date() } });
    return { results, ok: okCount, total: results.length };
  });
}
