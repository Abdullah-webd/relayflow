import OpenAI from "openai";
import { env } from "../env";

// Model-agnostic: swap env.openaiModel (and this client's base) for DeepSeek later
// without touching the monitor logic.
const client = env.openaiApiKey
  ? new OpenAI({ apiKey: env.openaiApiKey, timeout: 60_000, maxRetries: 1, ...(env.openaiBaseUrl ? { baseURL: env.openaiBaseUrl } : {}) })
  : null;

export interface JudgeMessage {
  from: string;
  text: string;
  channel: string;
  at: string;
}
export interface JudgeResult {
  matched: boolean;
  summary: string;
  usage?: { inputTokens: number; outputTokens: number };
  ms?: number;
}

/**
 * Decide whether any of the given (new) messages satisfy a natural-language monitor
 * condition. Used for fuzzy intent like "someone asks about cloth" — semantic, not keyword.
 */
export async function judgeMonitor(condition: string, messages: JudgeMessage[]): Promise<JudgeResult> {
  if (!client || messages.length === 0) return { matched: false, summary: "" };
  const list = messages
    .map((m, i) => `${i + 1}. [${m.channel}] ${m.from}: ${m.text.replace(/\s+/g, " ").slice(0, 400)}`)
    .join("\n");
  const prompt =
    `A user is monitoring a channel with this condition:\n"${condition}"\n\n` +
    `New messages since the last check:\n${list}\n\n` +
    `Decide whether ANY of these messages satisfy the condition. Be reasonably inclusive about ` +
    `meaning (a message counts if it clearly relates to the intent, even with different wording), ` +
    `but do not invent matches. Respond with ONLY a JSON object of the form ` +
    `{"matched": boolean, "summary": string}. If matched, "summary" briefly says what matched and ` +
    `quotes the key part (max 2 sentences, name the sender). If not matched, "summary" is "".`;

  const startedAt = Date.now();
  try {
    const res = await client.responses.create({
      model: env.openaiModel,
      instructions: "You are a precise monitoring classifier. Output only a single JSON object, nothing else.",
      input: prompt,
    });
    const ms = Date.now() - startedAt;
    const usage = { inputTokens: (res as any).usage?.input_tokens ?? 0, outputTokens: (res as any).usage?.output_tokens ?? 0 };
    const text = res.output_text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0) return { matched: false, summary: "", usage, ms };
    const json = JSON.parse(text.slice(start, end + 1));
    return { matched: Boolean(json.matched), summary: String(json.summary || "").slice(0, 600), usage, ms };
  } catch (error) {
    console.error(`[monitor] judge failed: ${(error as Error).message}`);
    return { matched: false, summary: "", ms: Date.now() - startedAt };
  }
}
