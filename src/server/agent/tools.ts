import { getRecentMessages, listUserConnections, listDestinations, resolveSendTargets } from "../connectors/manager";
import type { Platform } from "../db";

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (userId: string, args: any) => Promise<unknown>;
}

const PLATFORMS: Platform[] = ["whatsapp", "telegram", "slack", "gmail"];

export const tools: ToolDef[] = [
  {
    name: "list_connections",
    description:
      "List the user's messaging channels and their live status (connected / disconnected / needs setup) and how many destinations are selected. Use this to know what is connected before answering or sending.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    handler: async (userId) => {
      const views = await listUserConnections(userId);
      const byPlatform = Object.fromEntries(
        PLATFORMS.map((p) => {
          const v = views.find((x) => x.platform === p);
          return [p, v ? { status: v.status, name: v.displayName, selected_destinations: v.selectedCount, error: v.lastError } : { status: "not_connected" }];
        }),
      );
      return { connections: byPlatform };
    },
  },
  {
    name: "list_destinations",
    description:
      "List the actual groups/channels the user has on their connected platforms, by NAME (e.g. WhatsApp groups). Use this to answer 'list my groups', 'do you know the X group', or to find a specific group before reading it or sending to it.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: ["string", "null"], enum: [...PLATFORMS, null], description: "Limit to one platform, or null for all." },
      },
      required: ["platform"],
      additionalProperties: false,
    },
    handler: async (userId, args) => {
      const platform = args.platform && PLATFORMS.includes(args.platform) ? (args.platform as Platform) : undefined;
      const dests = await listDestinations(userId, platform);
      return {
        count: dests.length,
        destinations: dests.map((d) => ({ platform: d.platform, name: d.name, kind: d.kind, included: d.selected })),
      };
    },
  },
  {
    name: "get_recent_messages",
    description:
      "Read a small, recent slice of messages from the user's connected channels. Use `group` to read a SPECIFIC group/channel by name (e.g. 'Dev Syndicate'). Only recent messages are available (roughly the last week), never full history.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: ["string", "null"], enum: [...PLATFORMS, null], description: "Limit to one platform, or null for all connected channels." },
        group: { type: ["string", "null"], description: "A specific group/channel name (or id) to read from, or null for the user's selected channels." },
        limit: { type: "integer", minimum: 1, maximum: 30, description: "How many recent messages to return." },
      },
      required: ["platform", "group", "limit"],
      additionalProperties: false,
    },
    handler: async (userId, args) => {
      const platform = args.platform && PLATFORMS.includes(args.platform) ? (args.platform as Platform) : undefined;
      const messages = await getRecentMessages(userId, { platform, group: args.group, limit: args.limit ?? 15 });
      return {
        count: messages.length,
        messages: messages.map((m) => ({
          platform: m.platform,
          channel: m.destinationName,
          from: m.senderName,
          text: m.text,
          at: m.occurredAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "prepare_send",
    description:
      "Prepare a message to send. Use `group` to target a SPECIFIC group/channel by name (e.g. 'Dev Syndicate'); otherwise it goes to all the selected channels of the chosen platforms. Use platforms ['all'] to reach every connected channel. This does NOT send — it returns a preview the user must approve first. If unsure about the destination or content, ask the user in text instead of calling this.",
    parameters: {
      type: "object",
      properties: {
        platforms: {
          type: "array",
          items: { type: "string", enum: [...PLATFORMS, "all"] },
          description: "Which platforms to send on. Use ['all'] for every connected channel.",
        },
        group: { type: ["string", "null"], description: "A specific group/channel name (or id) to target, or null for the selected channels of the chosen platforms." },
        content: { type: "string", description: "The exact message text to send." },
      },
      required: ["platforms", "group", "content"],
      additionalProperties: false,
    },
    handler: async (userId, args) => {
      const targets = await resolveSendTargets(userId, args.platforms, args.group);
      return {
        status: "pending_confirmation",
        action: "send",
        content: args.content,
        targets: targets.map((t) => ({ platform: t.platform, connectionId: t.connectionId, externalId: t.externalId, name: t.name })),
        note: targets.length
          ? `Ready to send to ${targets.length} destination${targets.length === 1 ? "" : "s"}. Awaiting the user's approval.`
          : "No matching connected destination was found.",
      };
    },
  },
  {
    name: "prepare_schedule",
    description:
      "Prepare a scheduled task the user must approve. Use this when the user asks to be reminded or to have something happen at a time (e.g. 'every day at 9am send a good-morning to WhatsApp', 'remind me Friday 3pm'). The instruction will be run by the agent when it fires.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title for the task." },
        instruction: { type: "string", description: "What the agent should do when it fires, in plain language." },
        schedule: { type: "string", enum: ["once", "daily", "weekly"], description: "How often it repeats." },
        run_at: { type: "string", description: "ISO 8601 UTC timestamp for the first/next run." },
      },
      required: ["title", "instruction", "schedule", "run_at"],
      additionalProperties: false,
    },
    handler: async (_userId, args) => ({
      status: "pending_confirmation",
      action: "schedule",
      title: args.title,
      instruction: args.instruction,
      schedule: args.schedule,
      run_at: args.run_at,
      note: "Awaiting the user's approval before scheduling.",
    }),
  },
  {
    name: "prepare_monitor",
    description:
      "Prepare a MONITOR the user must approve. Use this when the user asks to WATCH a channel and be told when something happens — e.g. 'let me know when someone asks about pricing in the Dev group', 'watch my Gmail for a reply from the bank', 'tell me if the delivery confirmation doesn't arrive by tomorrow'. RelayFlow checks on an interval (default 30 min, minimum 15) and emails the user ONLY when the condition is met — it does NOT notify on every message. Prefer this over prepare_schedule whenever the user wants ongoing watching/notifying based on a condition rather than a fixed-time action.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short title for the monitor (e.g. 'Bank reply', 'Cloth questions')." },
        platform: { type: "string", enum: PLATFORMS, description: "Which channel to watch." },
        group: { type: ["string", "null"], description: "A specific group/channel name to watch (e.g. 'Dev Syndicate'), or null for the platform's selected channels." },
        condition: { type: "string", description: "In plain language, what to watch for (e.g. 'someone asks about cloth', 'a reply from the bank about my loan')." },
        mode: {
          type: "string",
          enum: ["match", "absence"],
          description: "'match' = notify when this happens. 'absence' = notify if this has NOT happened by the deadline.",
        },
        interval_minutes: { type: "integer", minimum: 15, maximum: 1440, description: "How often to check, in minutes. Default 30. Minimum 15." },
        absence_hours: { type: ["number", "null"], description: "For 'absence' mode ONLY: how many hours to wait before alerting that it didn't happen. Use null for 'match' mode." },
      },
      required: ["title", "platform", "group", "condition", "mode", "interval_minutes", "absence_hours"],
      additionalProperties: false,
    },
    handler: async (_userId, args) => ({
      status: "pending_confirmation",
      action: "monitor",
      title: args.title,
      platform: args.platform,
      group: args.group,
      condition: args.condition,
      mode: args.mode === "absence" ? "absence" : "match",
      interval_minutes: Math.max(15, Number(args.interval_minutes) || 30),
      absence_hours: args.mode === "absence" ? args.absence_hours ?? 24 : null,
      note: "Awaiting the user's approval before starting the monitor.",
    }),
  },
];

export const toolByName = new Map(tools.map((t) => [t.name, t]));

export const toolSchemas = tools.map((t) => ({
  type: "function" as const,
  name: t.name,
  description: t.description,
  strict: true,
  parameters: t.parameters,
}));
