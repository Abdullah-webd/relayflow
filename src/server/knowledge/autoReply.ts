import OpenAI from "openai";
import { env } from "../env";
import { autoReplies, users, type Platform } from "../db";
import { uid } from "../lib/crypto";
import { getKnowledgeContext } from "./knowledge";
import { tryConsumeCredits } from "../billing/stripe";
import { CREDITS_PER_MESSAGE } from "../billing/plans";
import { sendToTargets, type SendTarget } from "../connectors/manager";
import { sendGmail } from "../connectors/gmail";

const client = env.openaiApiKey
  ? new OpenAI({ apiKey: env.openaiApiKey, timeout: 60_000, maxRetries: 1, ...(env.openaiBaseUrl ? { baseURL: env.openaiBaseUrl } : {}) })
  : null;

export interface InboundMessage {
  userId: string;
  platform: Platform;
  connectionId: string;
  destinationExternalId: string;
  destinationName: string;
  senderName: string;
  text: string;
}

export interface Decision {
  reply: boolean;
  answer: string;
  reason: string;
}

/**
 * The confidence gate. Given the company's facts + guardrails and one customer message,
 * decide whether to answer — and ONLY answer from the facts. When in doubt, stay silent.
 */
export async function decideReply(guardrails: string, knowledge: string, senderName: string, message: string): Promise<Decision> {
  if (!client) return { reply: false, answer: "", reason: "AI not configured" };
  const instructions =
    "You are a customer-support agent replying on behalf of a business, using ONLY the facts the business provided. " +
    "Rules:\n" +
    "1) Answer ONLY if the customer's message is a question/request that the FACTS clearly and confidently answer. " +
    "If the facts don't clearly cover it, or you're unsure, DO NOT answer.\n" +
    "2) Obey the business's guardrails exactly. If they say not to discuss something, do not.\n" +
    "3) Never invent facts, prices, policies, or promises. No guessing.\n" +
    "4) If the message isn't really a question (greeting, chit-chat, spam, a statement), do not answer.\n" +
    "5) When you do answer, be brief, friendly, and use ONLY the facts. Write it as the message to send — no preamble.\n" +
    'Respond with ONLY JSON: {"reply": boolean, "answer": string, "reason": string}. ' +
    'If reply is false, answer is "" and reason briefly says why.';
  const input =
    `BUSINESS FACTS (the only source of truth):\n${knowledge || "(none provided)"}\n\n` +
    `BUSINESS GUARDRAILS:\n${guardrails || "(none)"}\n\n` +
    `INCOMING MESSAGE from ${senderName}:\n"${message}"`;
  try {
    const res = await client.responses.create({ model: env.openaiModel, instructions, input });
    const t = res.output_text ?? "";
    const json = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
    return {
      reply: Boolean(json.reply) && typeof json.answer === "string" && json.answer.trim().length > 0,
      answer: String(json.answer || "").trim(),
      reason: String(json.reason || "").slice(0, 200),
    };
  } catch (error) {
    return { reply: false, answer: "", reason: `judge failed: ${(error as Error).message}` };
  }
}

function emailFrom(header: string): string | null {
  const m = header.match(/<([^>]+@[^>]+)>/) || header.match(/([^\s<]+@[^\s>]+)/);
  return m ? m[1] : null;
}

async function deliverReply(msg: InboundMessage, answer: string): Promise<boolean> {
  if (msg.platform === "gmail") {
    const to = emailFrom(msg.senderName);
    if (!to) return false;
    await sendGmail(msg.connectionId, to, "Re: your message", answer);
    return true;
  }
  const target: SendTarget = { platform: msg.platform, connectionId: msg.connectionId, externalId: msg.destinationExternalId, name: msg.destinationName };
  const results = await sendToTargets(msg.userId, [target], answer);
  return results.some((r) => r.ok);
}

/**
 * Handle one incoming message on an auto-reply channel: decide, (maybe) send, and log.
 * Returns a small result for logging/tests. Never throws into the caller.
 */
export async function handleInbound(msg: InboundMessage): Promise<{ replied: boolean; reason: string }> {
  try {
    // Ignore our own messages / empty text.
    if (!msg.text?.trim() || /^You \(via RelayFlow\)/.test(msg.senderName)) return { replied: false, reason: "ignored" };

    // Rate-limit: at most one auto-reply per sender+destination per 90s.
    const recent = await autoReplies().findOne({
      connectionId: msg.connectionId,
      destinationExternalId: msg.destinationExternalId,
      incomingFrom: msg.senderName,
      replied: true,
      createdAt: { $gt: new Date(Date.now() - 90_000) },
    });
    if (recent) return { replied: false, reason: "rate-limited" };

    const { guardrails, text, hasContent } = await getKnowledgeContext(msg.userId);
    if (!hasContent) return { replied: false, reason: "no knowledge base" };

    // Each decision costs one credit (an AI action).
    if (env.stripe.enabled) {
      const paid = await tryConsumeCredits(msg.userId, CREDITS_PER_MESSAGE);
      if (!paid) return { replied: false, reason: "out of credits" };
    }

    const decision = await decideReply(guardrails, text, msg.senderName, msg.text);
    let replied = false;
    if (decision.reply && decision.answer) {
      replied = await deliverReply(msg, decision.answer);
    }

    await autoReplies().insertOne({
      _id: uid(),
      userId: msg.userId,
      platform: msg.platform,
      connectionId: msg.connectionId,
      destinationExternalId: msg.destinationExternalId,
      destinationName: msg.destinationName,
      incomingFrom: msg.senderName,
      incomingText: msg.text.slice(0, 500),
      replied,
      replyText: replied ? decision.answer.slice(0, 1000) : null,
      reason: replied ? null : decision.reason || "not confident",
      createdAt: new Date(),
    });
    return { replied, reason: replied ? "sent" : decision.reason };
  } catch (error) {
    console.error(`[auto-reply] failed: ${(error as Error).message}`);
    return { replied: false, reason: "error" };
  }
}

export async function ownerEmail(userId: string): Promise<string | null> {
  const u = await users().findOne({ _id: userId });
  return u?.email ?? null;
}
