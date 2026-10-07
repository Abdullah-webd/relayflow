import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../env";
import { users, monitors, scheduledTasks } from "../db";
import { requireAuth } from "../auth/context";
import { PLAN_LIST, TRIAL_DAYS, effectiveStatus } from "../billing/plans";
import { userCanUse, planFor, limitsForUser } from "../billing/access";
import {
  confirmCheckout,
  createCheckoutSession,
  createPortalSession,
  changeSubscriptionPlan,
  handleWebhook,
} from "../billing/stripe";

function appOrigin(req: FastifyRequest): string {
  if (env.webBaseUrl) return env.webBaseUrl;
  const proto = (req.headers["x-forwarded-proto"] as string) || (env.isProd ? "https" : "http");
  const host = req.headers["host"] || "localhost:8000";
  return `${proto}://${host}`;
}

/**
 * Verify + process a Stripe webhook. Shared so it can be mounted at both the API path
 * (/api/webhooks/stripe) and the root path (/webhooks) that the Stripe endpoint is
 * configured to hit. Raw body is captured by the content-type parser in index.ts.
 */
export async function stripeWebhookHandler(req: FastifyRequest, reply: FastifyReply) {
  if (!env.stripe.enabled || !env.stripe.webhookSecret) return reply.code(503).send({ error: "webhooks_disabled" });
  const signature = req.headers["stripe-signature"] as string | undefined;
  const raw = (req as any).rawBody as string | undefined;
  if (!signature || !raw) return reply.code(400).send({ error: "bad_signature" });
  try {
    const type = await handleWebhook(raw, signature);
    return reply.send({ received: true, type });
  } catch (error) {
    console.error(`[billing] webhook error: ${(error as Error).message}`);
    return reply.code(400).send({ error: "webhook_error" });
  }
}

export async function billingRoutes(app: FastifyInstance) {
  // Public: the plan catalogue for the pricing page.
  app.get("/billing/plans", async () => ({
    trialDays: TRIAL_DAYS,
    stripeEnabled: env.stripe.enabled,
    plans: PLAN_LIST.map((p) => ({
      key: p.key,
      name: p.name,
      blurb: p.blurb,
      priceUsd: p.priceUsd,
      features: p.features,
      popular: Boolean(p.popular),
    })),
  }));

  // The signed-in user's billing snapshot.
  app.get("/billing/state", { preHandler: requireAuth }, async (req) => {
    const user = await users().findOne({ _id: req.userId! });
    const limits = limitsForUser(user);
    const [monitorsUsed, tasksUsed] = await Promise.all([
      monitors().countDocuments({ userId: req.userId!, active: true }),
      scheduledTasks().countDocuments({ userId: req.userId!, active: true }),
    ]);
    const hasSub = Boolean(user?.stripeSubscriptionId) && !user?.compAccess && user?.trialSource !== "app";
    return {
      // The plan whose features apply now (trials get Pro), and the plan actually paid for.
      plan: planFor(user),
      paidPlan: user?.subscriptionStatus === "active" && hasSub ? (user.plan ?? null) : null,
      limits: {
        monitors: Number.isFinite(limits.monitors) ? limits.monitors : null,
        scheduledTasks: Number.isFinite(limits.scheduledTasks) ? limits.scheduledTasks : null,
        autoReply: limits.autoReply,
        model: limits.model,
      },
      usage: { monitors: monitorsUsed, scheduledTasks: tasksUsed },
      status: user ? effectiveStatus(user) : "none",
      hasAccess: userCanUse(user),
      // Only accounts with a real Stripe subscription can use the billing portal.
      hasStripeSubscription: hasSub,
      trialEndsAt: user?.trialEndsAt ?? null,
      currentPeriodEnd: user?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: Boolean(user?.cancelAtPeriodEnd),
    };
  });

  // Start a paid subscription (Starter or Pro) via Stripe Checkout. The free trial is in-app.
  app.post("/billing/checkout", { preHandler: requireAuth }, async (req, reply) => {
    if (!env.stripe.enabled) return reply.code(503).send({ error: "billing_unavailable" });
    const parsed = z.object({ plan: z.enum(["starter", "pro"]) }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const user = await users().findOne({ _id: req.userId! });
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    if (!user.emailVerified) return reply.code(403).send({ error: "email_unverified" });
    // Never create a second subscription for an account that already has one.
    // Already subscribed: switch plans instead of creating a second subscription.
    if (user.subscriptionStatus === "active") return reply.code(409).send({ error: "already_subscribed", detail: "You already have a subscription. Use Change plan instead." });
    try {
      const url = await createCheckoutSession(user, parsed.data.plan, appOrigin(req));
      return reply.send({ url });
    } catch (error) {
      console.error(`[billing] checkout failed: ${(error as Error).message}`);
      return reply.code(500).send({ error: "checkout_failed", detail: (error as Error).message });
    }
  });

  // Confirm right after the Checkout redirect (works even before webhooks are set up).
  app.post("/billing/confirm", { preHandler: requireAuth }, async (req, reply) => {
    if (!env.stripe.enabled) return reply.code(503).send({ error: "billing_unavailable" });
    const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    try {
      const ok = await confirmCheckout(req.userId!, parsed.data.sessionId);
      return reply.send({ ok });
    } catch (error) {
      console.error(`[billing] confirm failed: ${(error as Error).message}`);
      return reply.code(500).send({ error: "confirm_failed" });
    }
  });

  // Switch an active subscription between Starter and Pro (prorated by Stripe).
  app.post("/billing/change-plan", { preHandler: requireAuth }, async (req, reply) => {
    if (!env.stripe.enabled) return reply.code(503).send({ error: "billing_unavailable" });
    const parsed = z.object({ plan: z.enum(["starter", "pro"]) }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const user = await users().findOne({ _id: req.userId! });
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const hasSub = Boolean(user.stripeSubscriptionId) && !user.compAccess && user.trialSource !== "app";
    if (user.subscriptionStatus !== "active" || !hasSub) {
      return reply.code(409).send({ error: "no_subscription", detail: "Subscribe first, then you can switch plans." });
    }
    if (user.plan === parsed.data.plan) return reply.code(400).send({ error: "same_plan", detail: "You're already on this plan." });
    try {
      await changeSubscriptionPlan(user, parsed.data.plan);
      return reply.send({ ok: true, plan: parsed.data.plan });
    } catch (error) {
      console.error(`[billing] change plan failed: ${(error as Error).message}`);
      return reply.code(500).send({ error: "change_failed", detail: "Couldn’t change your plan. Please try again." });
    }
  });

  // Stripe-hosted billing portal (update card, cancel, invoices).
  app.post("/billing/portal", { preHandler: requireAuth }, async (req, reply) => {
    if (!env.stripe.enabled) return reply.code(503).send({ error: "billing_unavailable" });
    const user = await users().findOne({ _id: req.userId! });
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    try {
      const url = await createPortalSession(user, appOrigin(req));
      return reply.send({ url });
    } catch (error) {
      console.error(`[billing] portal failed: ${(error as Error).message}`);
      return reply.code(500).send({ error: "portal_failed" });
    }
  });

  // Stripe webhook (API path). The root-path alias /webhooks is registered in index.ts.
  app.post("/webhooks/stripe", stripeWebhookHandler);
}
