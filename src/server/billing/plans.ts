// Plan catalogue. RelayFlow has a single subscription: one price, full access, no
// usage credits. The Stripe Price is created on demand (see stripe.ts) keyed by the
// stable lookup key below, so we never hard-code Stripe price IDs.
export type PlanKey = "pro";

export interface Plan {
  key: PlanKey;
  name: string;
  blurb: string;
  priceUsd: number; // monthly, in whole dollars
  amountCents: number;
  lookupKey: string; // stable id used to find/create the Stripe Price
  features: string[];
  popular?: boolean;
}

export const PLANS: Record<PlanKey, Plan> = {
  pro: {
    key: "pro",
    name: "Pro",
    blurb: "Everything RelayFlow does, one simple price",
    priceUsd: 15,
    amountCents: 1500,
    // New lookup key for the $15 live price (distinct from any earlier test prices).
    lookupKey: "rf_pro_monthly_v1",
    popular: true,
    features: [
      "Unlimited AI actions — no usage credits",
      "All 4 channels (WhatsApp, Telegram, Slack, Gmail)",
      "Approve-before-send on every message",
      "Scheduled tasks & smart monitors",
      "Auto-replies from your knowledge base",
      "Multiple chat sessions",
    ],
  },
};

// The single plan every subscription uses.
export const DEFAULT_PLAN: PlanKey = "pro";

export const PLAN_LIST: Plan[] = [PLANS.pro];

export const TRIAL_DAYS = 1;

export function planByLookupKey(lookupKey: string): Plan | undefined {
  return PLAN_LIST.find((p) => p.lookupKey === lookupKey);
}

export function isActiveStatus(status?: string | null): boolean {
  return status === "trialing" || status === "active";
}
