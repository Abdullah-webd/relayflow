import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env";
import { users, monitors, scheduledTasks, type User } from "../db";
import { TRIAL_DAYS, hasAccess, limitsFor, effectivePlan, PLAN_LIMITS, type PlanLimits, type PlanKey } from "./plans";

/** The plan whose features apply right now (Pro when the paywall is off, e.g. local dev). */
export function planFor(user: User | null | undefined): PlanKey {
  if (!user || paywallOff()) return "pro";
  return effectivePlan(user);
}

export function limitsForUser(user: User | null | undefined): PlanLimits {
  return user && !paywallOff() ? limitsFor(user) : PLAN_LIMITS.pro;
}

/** Starter → the standard (fast) model; Pro and trials → the advanced (smarter) model. */
export function modelFor(user: User | null | undefined): string {
  return limitsForUser(user).model === "advanced" ? env.openaiModel : env.openaiModelStandard;
}

export async function modelForUserId(userId: string): Promise<string> {
  return modelFor(await users().findOne({ _id: userId }));
}

type QuotaKind = "monitors" | "scheduledTasks";
const quotaCollection = (kind: QuotaKind) => (kind === "monitors" ? monitors() : scheduledTasks());

/** Can this user add one more active monitor / scheduled task under their plan? */
export async function checkQuota(userId: string, kind: QuotaKind): Promise<{ ok: boolean; limit: number; used: number }> {
  const limit = limitsForUser(await users().findOne({ _id: userId }))[kind];
  if (!Number.isFinite(limit)) return { ok: true, limit, used: 0 };
  const used = await (quotaCollection(kind) as any).countDocuments({ userId, active: true });
  return { ok: used < limit, limit, used };
}

/**
 * Background guard for downgrades: on Starter, only the oldest N active items run; the rest
 * pause (and resume automatically on upgrade or when the user removes some).
 */
export async function withinQuota(userId: string, kind: QuotaKind, itemId: string): Promise<boolean> {
  const limit = limitsForUser(await users().findOne({ _id: userId }))[kind];
  if (!Number.isFinite(limit)) return true;
  const allowed = await (quotaCollection(kind) as any)
    .find({ userId, active: true }, { projection: { _id: 1 } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
  return allowed.some((d: { _id: string }) => d._id === itemId);
}

export function planLimitMessage(kind: QuotaKind, limit: number): string {
  const what = kind === "monitors" ? "monitors" : "scheduled tasks";
  return `The Starter plan includes up to ${limit} active ${what}. Upgrade to Pro for unlimited ${what}, or pause one you don't need.`;
}

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

/** Route guard for Pro-only features (knowledge base + auto-replies). Use after requireActivePlan. */
export async function requireProFeature(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await users().findOne({ _id: req.userId! });
  if (!limitsForUser(user).autoReply) {
    return void (await reply.code(403).send({ error: "upgrade_required", detail: "The knowledge base and auto-replies are part of the Pro plan." }));
  }
}
