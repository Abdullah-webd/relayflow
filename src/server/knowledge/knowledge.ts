import { knowledgeBase, knowledgeDocs } from "../db";

const MAX_CONTEXT_CHARS = 14_000; // keep the prompt affordable; Phase 2 swaps this for vector search

export interface KnowledgeContext {
  guardrails: string;
  text: string;
  hasContent: boolean;
}

/** Assemble everything the auto-reply agent should ground its answers in. */
export async function getKnowledgeContext(userId: string): Promise<KnowledgeContext> {
  const kb = await knowledgeBase().findOne({ _id: userId });
  const docs = await knowledgeDocs().find({ userId }).sort({ createdAt: 1 }).toArray();
  let text = "";
  for (const d of docs) {
    const block = `### ${d.title}\n${d.text}\n\n`;
    if (text.length + block.length > MAX_CONTEXT_CHARS) {
      text += block.slice(0, Math.max(0, MAX_CONTEXT_CHARS - text.length));
      break;
    }
    text += block;
  }
  const guardrails = (kb?.guardrails || "").trim();
  return { guardrails, text: text.trim(), hasContent: text.trim().length > 0 };
}

export async function setGuardrails(userId: string, guardrails: string): Promise<void> {
  const now = new Date();
  await knowledgeBase().updateOne(
    { _id: userId },
    { $set: { userId, guardrails: guardrails.slice(0, 5000), updatedAt: now }, $setOnInsert: { _id: userId, createdAt: now } },
    { upsert: true },
  );
}
