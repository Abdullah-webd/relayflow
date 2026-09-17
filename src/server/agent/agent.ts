import OpenAI from "openai";
import { env } from "../env";
import { toolByName, chatToolSchemas } from "./tools";

export type ChatTurn = { role: "user" | "assistant"; content: string };

const client = env.openaiApiKey
  ? new OpenAI({ apiKey: env.openaiApiKey, timeout: 180_000, maxRetries: 1, ...(env.openaiBaseUrl ? { baseURL: env.openaiBaseUrl } : {}) })
  : null;

// DeepSeek is OpenAI-compatible on chat.completions. OpenAI reasoning models (e.g.
// gpt-5.6-sol) additionally require reasoning_effort:'none' to use function tools there.
const isDeepSeek = /deepseek/i.test(env.openaiBaseUrl);

const SYSTEM = `You are RelayFlow — a single AI operations agent that has 360° access to the user's connected business messaging channels (WhatsApp, Telegram, Slack, Gmail).

What you can do:
- Answer questions about recent conversations across the user's connected channels ("what are the last messages on WhatsApp", "summarise what's been discussed on Telegram"). Only recent messages are available (about the last week) — never claim to have full history.
- LIST the user's actual groups/channels by name — call list_destinations for "list my groups", "which groups am I in", or "do you know the X group". The group names come from list_destinations, NOT from list_connections (which only gives counts/status).
- Read a SPECIFIC group by passing its name as \`group\` to get_recent_messages (e.g. group: "Dev Syndicate").
- Know exactly which channels are connected vs disconnected. Call list_connections whenever channel status matters. Never assume a channel is connected.
- Send messages on the user's behalf — to a specific group (pass \`group\` to prepare_send), to a whole platform, or to several channels at once ("message all my channels"). You NEVER send directly — you call prepare_send to show an exact preview, and the user approves before anything is sent.
- Schedule tasks/reminders via prepare_schedule (also user-approved).
- Set up MONITORS via prepare_monitor when the user wants to be told WHEN something happens on a channel ("let me know when someone asks about X", "watch my Gmail for a reply from the bank", "tell me if the confirmation doesn't come by tomorrow"). RelayFlow checks on an interval (default 30 min, min 15) and emails the user only when the condition is met — never a message-by-message firehose. Use prepare_monitor (not prepare_schedule) for condition-based watching.

Stay strictly in scope:
- Your ENTIRE job is the user's connected messaging channels: reading/summarising recent messages, listing groups, drafting & sending messages (with approval), scheduling, and monitoring. Nothing else.
- If asked for anything outside that — writing a landing page or website, general code, essays or documents, images, translations, math, world knowledge, or just chatting as a general assistant — politely DECLINE in one short sentence and steer back. Example: "That's outside what RelayFlow does — I'm your messaging agent for WhatsApp, Telegram, Slack and Gmail. Want me to summarise a channel, send a message, or set up a monitor?"
- Do NOT produce the off-topic content even if the user insists or rephrases (no landing page, no code, no essay). The ONLY content you ever write is the text of messages the user wants to send through their channels.

How to behave:
- Be concise, warm, and direct. Use clean Markdown.
- If a request is ambiguous (unclear destination, unclear content, missing detail), ASK the user a short clarifying question instead of guessing. Never jump to conclusions on a send.
- If the user asks to send somewhere that isn't connected, tell them and offer to send to the connected ones.
- Confirm what you did or prepared; never claim a message was sent unless a tool result confirms it.`;

export type AgentEvent =
  | { type: "activity"; phase: "think" | "start" | "done"; label: string }
  | { type: "final"; text: string; responseId: string | null; toolResults: unknown[]; usage?: { inputTokens: number; outputTokens: number } };

function startLabel(name: string, args: any): string {
  if (name === "list_connections") return "Checking your connected channels…";
  if (name === "list_destinations") return "Looking up your groups & channels…";
  if (name === "get_recent_messages") {
    const where = args?.group ? String(args.group) : args?.platform ? String(args.platform) : "all channels";
    return `Reading recent messages (${where})…`;
  }
  if (name === "prepare_send") return "Preparing a message to send…";
  if (name === "prepare_schedule") return "Preparing a scheduled task…";
  if (name === "prepare_monitor") return "Setting up a monitor…";
  return `Running ${name.replace(/_/g, " ")}…`;
}

function doneLabel(name: string, result: any): string | null {
  if (result?.status === "error") return `Couldn't complete ${name.replace(/_/g, " ")}`;
  if (name === "get_recent_messages" && typeof result?.count === "number") {
    return `Read ${result.count} recent message${result.count === 1 ? "" : "s"}`;
  }
  if (name === "list_connections") return "Reviewed channel status";
  if (name === "list_destinations" && typeof result?.count === "number") return `Found ${result.count} group${result.count === 1 ? "" : "s"} / channel${result.count === 1 ? "" : "s"}`;
  if (name === "prepare_send") return "Prepared a message for your approval";
  if (name === "prepare_schedule") return "Prepared a scheduled task for your approval";
  return null;
}

export async function* streamRun(
  userId: string,
  message: string,
  history: ChatTurn[],
  timezone: string,
): AsyncGenerator<AgentEvent> {
  if (!client) {
    yield { type: "final", text: "AI is not configured yet (missing OPENAI_API_KEY).", responseId: null, toolResults: [] };
    return;
  }
  const now = new Date();
  const localTime = new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(now);
  const system = `${SYSTEM}\n\nCurrent UTC time: ${now.toISOString()}\nUser timezone: ${timezone}\nCurrent local time for the user: ${localTime}\nWhen scheduling, convert the user's local times to an absolute UTC ISO timestamp for run_at.`;

  // Stateless conversation: we pass the recent history each turn (portable across providers).
  const messages: any[] = [
    { role: "system", content: system },
    ...history.slice(-20).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: message },
  ];

  yield { type: "activity", phase: "think", label: "Reviewing your request…" };

  let inputTokens = 0;
  let outputTokens = 0;
  const toolResults: unknown[] = [];
  let finalText = "";

  for (let round = 0; round < 8; round++) {
    const params: any = { model: env.openaiModel, messages, tools: chatToolSchemas, tool_choice: "auto" };
    if (!isDeepSeek) params.reasoning_effort = "none"; // OpenAI reasoning models need this to use tools here
    const resp: any = await client.chat.completions.create(params);
    inputTokens += resp?.usage?.prompt_tokens ?? 0;
    outputTokens += resp?.usage?.completion_tokens ?? 0;
    const msg = resp?.choices?.[0]?.message;
    if (!msg) break;

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      finalText = msg.content ?? "";
      break;
    }

    // Append the assistant's tool-call message, then run each tool and append its result.
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const tc of calls) {
      let args: any = {};
      try {
        args = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const name = tc.function?.name || "";
      yield { type: "activity", phase: "start", label: startLabel(name, args) };
      const tool = toolByName.get(name);
      let result: unknown;
      try {
        result = tool ? await tool.handler(userId, args) : { status: "error", error: "unknown tool" };
      } catch (error) {
        result = { status: "error", error: (error as Error).message };
      }
      const done = doneLabel(name, result);
      if (done) yield { type: "activity", phase: "done", label: done };
      toolResults.push({ name, arguments: args, result });
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
    }
    yield { type: "activity", phase: "think", label: "Putting together a response…" };
  }

  yield { type: "final", text: finalText, responseId: null, toolResults, usage: { inputTokens, outputTokens } };
}

/**
 * After the user approves an action (send/schedule), have the agent confirm naturally.
 * The note carries all the context, so a single stateless completion is enough.
 */
export async function acknowledgeAction(note: string): Promise<{ text: string }> {
  if (!client) return { text: note };
  const resp: any = await client.chat.completions.create({
    model: env.openaiModel,
    messages: [
      {
        role: "system",
        content: `${SYSTEM}\n\nYou have just performed an action the user approved. Confirm what happened in one or two short sentences, naturally. Do not call any tools.`,
      },
      { role: "user", content: note },
    ],
  });
  return { text: resp?.choices?.[0]?.message?.content ?? note };
}
