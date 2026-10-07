// Shared by the server (injects these tags into the HTML Google receives) and the web app
// (page titles while navigating). Keep copy here in sync with what the pages actually show.
export const SITE_URL = "https://userelayflow.com";
export const SITE_NAME = "RelayFlow";
export const PRICES = { starter: 15, pro: 30 } as const;

export interface RouteMeta {
  title: string;
  description: string;
  index: boolean; // false → <meta name="robots" content="noindex">
}

const DEFAULT_DESC =
  "RelayFlow is an AI agent for WhatsApp, Telegram and Slack. Ask what happened across every chat, get summaries, send to any group, set instant alerts and auto-reply from your knowledge base. Free 1-day trial.";

export const ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title: "RelayFlow — AI agent for WhatsApp, Telegram & Slack business chats",
    description: DEFAULT_DESC,
    index: true,
  },
  "/pricing": {
    title: "Pricing — RelayFlow | Starter $15, Pro $30 per month",
    description: `Simple pricing for RelayFlow: Starter at $${PRICES.starter}/month and Pro at $${PRICES.pro}/month with auto-replies and a smarter AI model. Start with a 1-day free trial, no credit card required.`,
    index: true,
  },
  "/signup": {
    title: "Start your free trial — RelayFlow",
    description: "Create your RelayFlow workspace and try every Pro feature free for 1 day. No credit card required.",
    index: true,
  },
  "/privacy": {
    title: "Privacy Policy — RelayFlow",
    description: "How RelayFlow collects, uses, stores and protects your data, including messages from WhatsApp, Telegram and Slack.",
    index: true,
  },
  "/terms": {
    title: "Terms of Service — RelayFlow",
    description: "The terms for using RelayFlow, including the free trial, Starter and Pro plans, billing and acceptable use.",
    index: true,
  },
  "/login": { title: "Sign in — RelayFlow", description: "Sign in to your RelayFlow workspace.", index: false },
  "/verify": { title: "Verify your email — RelayFlow", description: "Verify your email to start using RelayFlow.", index: false },
  "/forgot": { title: "Reset your password — RelayFlow", description: "Reset your RelayFlow password.", index: false },
  "/reset": { title: "Choose a new password — RelayFlow", description: "Choose a new RelayFlow password.", index: false },
};

export const APP_META: RouteMeta = { title: "RelayFlow", description: DEFAULT_DESC, index: false };
export const NOT_FOUND_META: RouteMeta = { title: "Page not found — RelayFlow", description: DEFAULT_DESC, index: false };

/** Metadata for a path, or null when the path isn't a real page (→ 404). */
export function metaFor(pathname: string): RouteMeta | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (ROUTE_META[path]) return ROUTE_META[path];
  if (path === "/app" || path.startsWith("/app/")) return APP_META;
  return null;
}

export const FAQS: { q: string; a: string }[] = [
  {
    q: "Is RelayFlow secure?",
    a: "Yes. Sensitive credentials are encrypted at the field level, and Slack connects through its official OAuth sign-in. Anything the agent sends for you waits for your approval, and auto-replies only run on the channels you turn them on for.",
  },
  {
    q: "Does it store my whole message history?",
    a: "No. RelayFlow keeps only recent messages so it can answer questions and summarize. Channel messages are deleted automatically after 14 days, and it never archives your full history.",
  },
  {
    q: "Can it send to all my channels at once?",
    a: "Yes. Ask it to message one specific group or every connected channel at the same time. You see the exact message and destinations, and approve before anything is delivered.",
  },
  {
    q: "How much does it cost?",
    a: `Starter is $${PRICES.starter} a month and Pro is $${PRICES.pro} a month. Pro adds auto-replies from your knowledge base, a smarter AI model, and unlimited monitors and scheduled tasks. Every account starts with a 1-day free trial of Pro, no credit card required.`,
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. The free trial needs no card, so there's nothing to cancel if you decide it isn't for you. If you subscribe, cancel from Settings whenever you like. No contracts.",
  },
  {
    q: "Which channels can I connect?",
    a: "WhatsApp, Telegram and Slack. You can connect one or all three, and see at a glance which are live. Gmail support is coming soon.",
  },
];

/** JSON-LD for the home page: organization, product with prices, and the visible FAQ. */
export function homeStructuredData(): object[] {
  return [
    { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icon-512.png` },
    { "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description: DEFAULT_DESC,
      offers: [
        { "@type": "Offer", name: "Starter", price: String(PRICES.starter), priceCurrency: "USD" },
        { "@type": "Offer", name: "Pro", price: String(PRICES.pro), priceCurrency: "USD" },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
}
