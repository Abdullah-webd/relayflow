// ---------------------------------------------------------------------------
// Eval datasets. Deterministic, model-agnostic — the same cases run against
// whatever model OPENAI_MODEL/OPENAI_BASE_URL point at (OpenAI today, DeepSeek later).
// ---------------------------------------------------------------------------

// ---- Monitor judge: (condition, message, shouldMatch). Pure classifier. ----
export interface MonitorCase {
  condition: string;
  message: string;
  shouldMatch: boolean;
}

export const MONITOR_CASES: MonitorCase[] = [
  // cloth / fabric — semantic (no literal keyword)
  { condition: "someone asks about cloth", message: "do you guys sell ankara fabric or any material?", shouldMatch: true },
  { condition: "someone asks about cloth", message: "how much for 6 yards of lace?", shouldMatch: true },
  { condition: "someone asks about cloth", message: "I need material for my daughter's dress, do you have?", shouldMatch: true },
  { condition: "someone asks about cloth", message: "what time is the meeting today?", shouldMatch: false },
  { condition: "someone asks about cloth", message: "the wifi is down again", shouldMatch: false },
  { condition: "someone asks about cloth", message: "can I get the fabric samples you posted?", shouldMatch: true },
  // bank reply / loan
  { condition: "a reply from the bank about my loan", message: "Dear customer, your loan application has been approved.", shouldMatch: true },
  { condition: "a reply from the bank about my loan", message: "GTBank: your OTP is 483920", shouldMatch: false },
  { condition: "a reply from the bank about my loan", message: "We regret to inform you your facility request was declined.", shouldMatch: true },
  { condition: "a reply from the bank about my loan", message: "Your electricity bill is due tomorrow", shouldMatch: false },
  // delivery complaint
  { condition: "a customer complains about delivery", message: "my order still hasn't arrived, it's been 5 days!", shouldMatch: true },
  { condition: "a customer complains about delivery", message: "the dispatch rider went to the wrong address again", shouldMatch: true },
  { condition: "a customer complains about delivery", message: "thanks, the package arrived quickly!", shouldMatch: false },
  { condition: "a customer complains about delivery", message: "do you deliver on Sundays?", shouldMatch: false },
  // pricing questions
  { condition: "someone asks about pricing", message: "how much is the premium plan?", shouldMatch: true },
  { condition: "someone asks about pricing", message: "what's your cheapest option?", shouldMatch: true },
  { condition: "someone asks about pricing", message: "great product, love it!", shouldMatch: false },
  { condition: "someone asks about pricing", message: "is there a discount for students?", shouldMatch: true },
  { condition: "someone asks about pricing", message: "where are you located?", shouldMatch: false },
  // refund requests
  { condition: "a customer asks for a refund", message: "I want my money back, this isn't what I ordered", shouldMatch: true },
  { condition: "a customer asks for a refund", message: "can you send it back to my account please", shouldMatch: true },
  { condition: "a customer asks for a refund", message: "when is the next restock?", shouldMatch: false },
  // angry / upset customer
  { condition: "an angry or upset customer", message: "this is the WORST service I have ever used, disgusting", shouldMatch: true },
  { condition: "an angry or upset customer", message: "you people are a scam, I'm reporting you", shouldMatch: true },
  { condition: "an angry or upset customer", message: "okay thanks for the update", shouldMatch: false },
  { condition: "an angry or upset customer", message: "I'm a little confused about the instructions", shouldMatch: false },
  // someone shares a phone number
  { condition: "someone shares a phone number", message: "call me on 0803 123 4567", shouldMatch: true },
  { condition: "someone shares a phone number", message: "my number is +2348012345678", shouldMatch: true },
  { condition: "someone shares a phone number", message: "the order number is 5567", shouldMatch: false },
  // hiring / job posts
  { condition: "someone posts a job or is hiring", message: "We're hiring a frontend dev, remote, apply within", shouldMatch: true },
  { condition: "someone posts a job or is hiring", message: "anyone know a good graphics designer for hire?", shouldMatch: true },
  { condition: "someone posts a job or is hiring", message: "good morning everyone, happy new week", shouldMatch: false },
  // meeting time change
  { condition: "the meeting time changes", message: "let's move today's call to 4pm instead of 2", shouldMatch: true },
  { condition: "the meeting time changes", message: "reminder: standup at 9am as usual", shouldMatch: false },
  { condition: "the meeting time changes", message: "can we reschedule tomorrow's review to Friday?", shouldMatch: true },
  // someone mentions a competitor
  { condition: "someone mentions a competitor by name", message: "I heard Jumia has this cheaper", shouldMatch: true },
  { condition: "someone mentions a competitor by name", message: "the weather is nice today", shouldMatch: false },
  // urgent / emergency
  { condition: "something urgent that needs my attention now", message: "URGENT: the payment gateway is down, customers can't checkout!", shouldMatch: true },
  { condition: "something urgent that needs my attention now", message: "fyi I'll be a few minutes late", shouldMatch: false },
  { condition: "something urgent that needs my attention now", message: "emergency — the client wants to cancel the whole contract today", shouldMatch: true },
];

// ---- Agent golden cases (run against seeded WhatsApp + Telegram data) ----
export interface AgentCase {
  name: string;
  input: string;
  // returns { pass, detail } given the agent's final text + tool calls
  check: (finalText: string, tools: { name: string; arguments: any; result: any }[]) => { pass: boolean; detail: string };
}

const hasTool = (tools: any[], name: string) => tools.some((t) => t.name === name);
const sendTargets = (tools: any[]) => {
  const t = tools.find((x) => x.name === "prepare_send");
  return (t?.result?.targets ?? []) as { platform: string; name: string }[];
};
const looksLikeCode = (s: string) => /<html|<!doctype|```|<\/?div|<body|function\s|const\s+\w+\s*=/i.test(s);

export const AGENT_CASES: AgentCase[] = [
  {
    name: "list groups → list_destinations",
    input: "list all my whatsapp groups",
    check: (text, tools) => ({
      pass: hasTool(tools, "list_destinations") && /study master/i.test(text + JSON.stringify(tools)),
      detail: `tools=[${tools.map((t) => t.name).join(",")}]`,
    }),
  },
  {
    name: "read a specific group → get_recent_messages",
    input: "what are the most recent messages in the Study Master group?",
    check: (_t, tools) => ({ pass: hasTool(tools, "get_recent_messages"), detail: `tools=[${tools.map((t) => t.name).join(",")}]` }),
  },
  {
    name: "send to a specific group → prepare_send targets Study Master (whatsapp)",
    input: "send 'Good morning everyone!' to my Study Master group",
    check: (_t, tools) => {
      const tg = sendTargets(tools);
      const ok = hasTool(tools, "prepare_send") && tg.some((x) => x.platform === "whatsapp" && /study ?master/i.test(x.name));
      return { pass: ok, detail: `targets=${JSON.stringify(tg)}` };
    },
  },
  {
    name: "fuzzy group name 'Studymaster' resolves 'Study Master' (regression)",
    input: "send 'hello' to Studymaster",
    check: (_t, tools) => {
      const tg = sendTargets(tools);
      return { pass: tg.some((x) => /study ?master/i.test(x.name)), detail: `targets=${JSON.stringify(tg)}` };
    },
  },
  {
    name: "send to all channels → targets span ≥2 platforms",
    input: "send 'We are open for business today!' to all my channels",
    check: (_t, tools) => {
      const tg = sendTargets(tools);
      const platforms = new Set(tg.map((x) => x.platform));
      return { pass: hasTool(tools, "prepare_send") && platforms.size >= 2, detail: `platforms=${[...platforms].join(",")}` };
    },
  },
  {
    name: "monitor request → prepare_monitor (not schedule)",
    input: "let me know when someone asks about cloth in the Study Master group",
    check: (_t, tools) => ({
      pass: hasTool(tools, "prepare_monitor") && !hasTool(tools, "prepare_schedule"),
      detail: `tools=[${tools.map((t) => t.name).join(",")}]`,
    }),
  },
  {
    name: "off-topic (landing page) → refuse, no code, no tools",
    input: "Create a full landing page in HTML and CSS for my bakery business",
    check: (text, tools) => ({
      pass: tools.length === 0 && !looksLikeCode(text),
      detail: `tools=${tools.length} code=${looksLikeCode(text)} reply="${text.slice(0, 80)}"`,
    }),
  },
  {
    name: "off-topic (general knowledge) → refuse / redirect, no tools",
    input: "what is the capital of France and write me a poem about it",
    check: (text, tools) => ({
      pass: tools.length === 0 && !/paris/i.test(text.split("\n")[0] || ""),
      detail: `tools=${tools.length} reply="${text.slice(0, 80)}"`,
    }),
  },
];
