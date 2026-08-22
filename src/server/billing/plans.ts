// Plan catalogue. Prices are created in Stripe on demand (see stripe.ts) keyed by
// these lookup keys, so we never hard-code Stripe price IDs.
export type PlanKey = "starter" | "growth";

export interface Plan {
  key: PlanKey;
  name: string;
  blurb: string;
  priceUsd: number; // monthly, in whole dollars
  amountCents: number;
  credits: number; // AI credits granted each billing period
  lookupKey: string; // stable id used to find/create the Stripe Price
  features: string[];
  popular?: boolean;
}

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    blurb: "For individuals & small teams",
    priceUsd: 10,
    amountCents: 1000,
    credits: 500,
    lookupKey: "rf_starter_monthly_v1",
    features: [
      "500 AI credits / month",
      "All 4 channels (WhatsApp, Telegram, Slack, Gmail)",
      "Approve-before-send on every message",
      "Scheduled tasks",
      "Multiple chat sessions",
    ],
  },
  growth: {
    key: "growth",
    name: "Growth",
    blurb: "For busy teams & agencies",
    priceUsd: 30,
    amountCents: 3000,
    credits: 2000,
    lookupKey: "rf_growth_monthly_v1",
    popular: true,
    features: [
      "2,000 AI credits / month",
      "Everything in Starter",
      "Priority AI processing",
      "Send to all channels at once",
      "Priority support",
    ],
  },
};

export const PLAN_LIST: Plan[] = [PLANS.starter, PLANS.growth];

export const TRIAL_DAYS = 1;
// One AI agent turn (a reply that may read channels and/or draft a send) costs this many credits.
export const CREDITS_PER_MESSAGE = 1;

export function planByLookupKey(lookupKey: string): Plan | undefined {
  return PLAN_LIST.find((p) => p.lookupKey === lookupKey);
}

export function isActiveStatus(status?: string | null): boolean {
  return status === "trialing" || status === "active";
}
