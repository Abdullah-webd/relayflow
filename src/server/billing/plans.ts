// Plan catalogue: Starter ($15) and Pro ($30). Stripe Prices are created on demand (see
// stripe.ts) keyed by the stable lookup keys below, so we never hard-code Stripe price IDs.
// Stripe prices are immutable: changing an amount needs a NEW lookup key.
export type PlanKey = "starter" | "pro";

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
  starter: {
    key: "starter",
    name: "Starter",
    blurb: "Run your channels from one AI chat",
    priceUsd: 15,
    amountCents: 1500,
    lookupKey: "rf_starter_monthly_v2", // v1 was an old $10 test price
    features: [
      "WhatsApp, Telegram and Slack",
      "Ask, summarize and search your chats",
      "Send to one group or all channels",
      "Approve-before-send on every message",
      "Up to 5 scheduled tasks",
      "Up to 3 monitors",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    blurb: "Smarter AI that also replies for you",
    priceUsd: 30,
    amountCents: 3000,
    lookupKey: "rf_pro_monthly_v2", // v1 was $15
    popular: true,
    features: [
      "Everything in Starter",
      "Smarter AI model for more accurate answers",
      "Auto-replies from your knowledge base",
      "Unlimited scheduled tasks",
      "Unlimited monitors",
    ],
  },
};

// What each plan can do. Infinity = unlimited.
export interface PlanLimits {
  monitors: number;
  scheduledTasks: number;
  autoReply: boolean; // knowledge base + auto-replies
  model: "standard" | "advanced";
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  starter: { monitors: 3, scheduledTasks: 5, autoReply: false, model: "standard" },
  pro: { monitors: Infinity, scheduledTasks: Infinity, autoReply: true, model: "advanced" },
};

// Fallback when a subscription's price can't be mapped (legacy data).
export const DEFAULT_PLAN: PlanKey = "pro";

export const PLAN_LIST: Plan[] = [PLANS.starter, PLANS.pro];

export const TRIAL_DAYS = 1;

export function planByLookupKey(lookupKey: string): Plan | undefined {
  return PLAN_LIST.find((p) => p.lookupKey === lookupKey);
}

export function isActiveStatus(status?: string | null): boolean {
  return status === "trialing" || status === "active";
}

// ---- Access rules (the single source of truth for the paywall) ----
// New accounts get an in-app trial with NO card: trialSource "app" + trialEndsAt.
// After it ends they must subscribe through Stripe (charged immediately, no Stripe trial).

export interface AccessFields {
  subscriptionStatus?: string | null;
  trialSource?: string | null;
  trialEndsAt?: Date | string | null;
  plan?: string | null;
}

// Every trial ends at trialEndsAt, whatever started it. (Leftover Stripe test-mode trials
// would otherwise stay "trialing" forever; real Stripe subscriptions flip to "active" via webhook.)
export function trialExpired(u: AccessFields, now = new Date()): boolean {
  return u.subscriptionStatus === "trialing" && (!u.trialEndsAt || new Date(u.trialEndsAt).getTime() <= now.getTime());
}

/** Whether the account may use the product right now (ignores the global PAYWALL_DISABLED switch). */
export function hasAccess(u: AccessFields, now = new Date()): boolean {
  if (u.subscriptionStatus === "active") return true;
  if (u.subscriptionStatus === "trialing") return !trialExpired(u, now);
  return false;
}

/** Status to show in the UI: an ended in-app trial reads as "trial_expired". */
export function effectiveStatus(u: AccessFields, now = new Date()): string {
  if (trialExpired(u, now)) return "trial_expired";
  return u.subscriptionStatus ?? "none";
}

/** Which plan's features apply. The free trial gets Pro; subscribers get what they pay for. */
export function effectivePlan(u: AccessFields): PlanKey {
  if (u.subscriptionStatus === "trialing") return "pro";
  return u.plan === "starter" ? "starter" : "pro";
}

export function limitsFor(u: AccessFields): PlanLimits {
  return PLAN_LIMITS[effectivePlan(u)];
}
