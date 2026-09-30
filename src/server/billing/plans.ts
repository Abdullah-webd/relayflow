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
    priceUsd: 30,
    amountCents: 3000,
    // Stripe prices are immutable: a new amount needs a new lookup key (v1 was $15).
    lookupKey: "rf_pro_monthly_v2",
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

// ---- Access rules (the single source of truth for the paywall) ----
// New accounts get an in-app trial with NO card: trialSource "app" + trialEndsAt.
// After it ends they must subscribe through Stripe (charged immediately, no Stripe trial).

export interface AccessFields {
  subscriptionStatus?: string | null;
  trialSource?: string | null;
  trialEndsAt?: Date | string | null;
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
