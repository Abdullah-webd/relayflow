import { env } from "../env";
import { users, type User } from "../db";
import { TRIAL_DAYS, hasAccess } from "./plans";

/**
 * Start the no-card in-app trial for a brand-new account, the first time its email is
 * verified. Existing accounts (already verified, or already had a trial or plan) never get one.
 * Returns the fields that were set, or null if the account isn't eligible.
 */
export async function startTrialIfEligible(user: User): Promise<Partial<User> | null> {
  if (user.emailVerified || user.trialStartedAt || (user.subscriptionStatus ?? "none") !== "none") return null;
  const now = new Date();
  const fields: Partial<User> = {
    subscriptionStatus: "trialing",
    trialSource: "app",
    trialStartedAt: now,
    trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
    updatedAt: now,
  };
  await users().updateOne({ _id: user._id }, { $set: fields });
  return fields;
}

/** True when the paywall is off (launch switch) or Stripe isn't configured (local dev). */
export function paywallOff(): boolean {
  return env.paywallDisabled || !env.stripe.enabled;
}

export function userCanUse(user: User | null | undefined): boolean {
  if (!user) return false;
  return paywallOff() || hasAccess(user);
}

// Background jobs (scheduler, monitors, auto-replies) check access per user. A short cache
// keeps that cheap; 60s staleness only matters in the minute a trial ends or a payment lands.
const cache = new Map<string, { ok: boolean; at: number }>();
const TTL_MS = 60_000;

export async function userHasAccessById(userId: string): Promise<boolean> {
  if (paywallOff()) return true;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;
  const user = await users().findOne({ _id: userId });
  const ok = userCanUse(user);
  cache.set(userId, { ok, at: Date.now() });
  return ok;
}
