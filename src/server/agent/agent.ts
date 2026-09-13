import OpenAI from "openai";
import { env } from "../env";
import { toolByName, toolSchemas } from "./tools";

const client = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey, timeout: 180_000, maxRetries: 1 }) : null;

const SYSTEM = `You are RelayFlow — a single AI operations agent that has 360° access to the user's connected business messaging channels (WhatsApp, Telegram, Slack, Gmail).

What you can do:
- Answer questions about recent conversations across the user's connected channels ("what are the last messages on WhatsApp", "summarise what's been discussed on Telegram"). Only recent messages are available (about the last week) — never claim to have full history.
- LIST the user's actual groups/channels by name — call list_destinations for "list my groups", "which groups am I in", or "do you know the X group". The group names come from list_destinations, NOT from list_connections (which only gives counts/status).
- Read a SPECIFIC group by passing its name as \`group\` to get_recent_messages (e.g. group: "Dev Syndicate").
- Know exactly which channels are connected vs disconnected. Call list_connections whenever channel status matters. Never assume a channel is connected.
- Send messages on the user's behalf — to a specific group (pass \`group\` to prepare_send), to a whole platform, or to several channels at once ("message all my channels"). You NEVER send directly — you call prepare_send to show an exact preview, and the user approves before anything is sent.
- Schedule tasks/reminders via prepare_schedule (also user-approved).
- Set up MONITORS via prepare_monitor when the user wants to be told WHEN something happens on a channel ("let me know when someone asks about X", "watch my Gmail for a reply from the bank", "tell me if the confirmation doesn't come by tomorrow"). RelayFlow checks on an interval (default 30 min, min 15) and emails the user only when the condition is met — never a message-by-message firehose. Use prepare_monitor (not prepare_schedule) for condition-based watching.

How to behave:
- Be concise, warm, and direct. Use clean Markdown.
- If a request is ambiguous (unclear destination, unclear content, missing detail), ASK the user a short clarifying question instead of guessing. Never jump to conclusions on a send.
- If the user asks to send somewhere that isn't connected, tell them and offer to send to the connected ones.
- Confirm what you did or prepared; never claim a message was sent unless a tool result confirms it.`;

export type AgentEvent =
  | { type: "activity"; phase: "think" | "start" | "done"; label: string }
  | { type: "final"; text: string; responseId: string | null; toolResults: unknown[] };

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
  previousResponseId: string | null,
  timezone: string,
): AsyncGenerator<AgentEvent> {
  if (!client) {
    yield { type: "final", text: "AI is not configured yet (missing OPENAI_API_KEY).", responseId: null, toolResults: [] };
    return;
  }
  const now = new Date();
  const localTime = new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(now);
  const instructions = `${SYSTEM}\n\nCurrent UTC time: ${now.toISOString()}\nUser timezone: ${timezone}\nCurrent local time for the user: ${localTime}\nWhen scheduling, convert the user's local times to an absolute UTC ISO timestamp for run_at.`;

  yield { type: "activity", phase: "think", label: "Reviewing your request…" };

  let response: any = await client.responses.create({
    model: env.openaiModel,
    instructions,
    input: message,
    tools: toolSchemas as any,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
  });

  const toolResults: unknown[] = [];
  for (let round = 0; round < 8; round++) {
    const followups: any[] = [];
    for (const item of response.output ?? []) {
      if (item.type !== "function_call") continue;
      let args: any = {};
      try {
        args = JSON.parse(item.arguments);
      } catch {
        args = {};
      }
      yield { type: "activity", phase: "start", label: startLabel(item.name, args) };
      const tool = toolByName.get(item.name);
      let result: unknown;
      try {
        result = tool ? await tool.handler(userId, args) : { status: "error", error: "unknown tool" };
      } catch (error) {
        result = { status: "error", error: (error as Error).message };
      }
      const done = doneLabel(item.name, result);
      if (done) yield { type: "activity", phase: "done", label: done };
      toolResults.push({ name: item.name, arguments: args, result });
      followups.push({ type: "function_call_output", call_id: item.call_id, output: JSON.stringify(result) });
    }
    if (followups.length === 0) break;
    yield { type: "activity", phase: "think", label: "Putting together a response…" };
    response = await client.responses.create({
      model: env.openaiModel,
      instructions,
      previous_response_id: response.id,
      input: followups,
      tools: toolSchemas as any,
    });
  }

  yield { type: "final", text: response.output_text ?? "", responseId: response.id ?? null, toolResults };
}

/**
 * After the user approves an action (send/schedule) via the card, feed the outcome back
 * into the agent's conversation chain so it KNOWS what happened and confirms naturally —
 * and so a later "did you send it?" is answered correctly.
 */
export async function acknowledgeAction(
  previousResponseId: string | null,
  note: string,
): Promise<{ text: string; responseId: string | null }> {
  if (!client) return { text: note, responseId: previousResponseId };
  const resp: any = await client.responses.create({
    model: env.openaiModel,
    instructions: `${SYSTEM}\n\nYou have just performed an action the user approved. Confirm what happened in one or two short sentences, naturally. Do not call any tools.`,
    input: note,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
  });
  return { text: resp.output_text ?? note, responseId: resp.id ?? previousResponseId };
}
