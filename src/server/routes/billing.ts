import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../env";
import { users } from "../db";
import { requireAuth } from "../auth/context";
import { PLAN_LIST, TRIAL_DAYS } from "../billing/plans";
import {
  confirmCheckout,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
} from "../billing/stripe";

function appOrigin(req: FastifyRequest): string {
  if (env.webBaseUrl) return env.webBaseUrl;
  const proto = (req.headers["x-forwarded-proto"] as string) || (env.isProd ? "https" : "http");
  const host = req.headers["host"] || "localhost:8000";
  return `${proto}://${host}`;
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
      credits: p.credits,
      features: p.features,
      popular: Boolean(p.popular),
    })),
  }));

  // The signed-in user's billing snapshot.
  app.get("/billing/state", { preHandler: requireAuth }, async (req) => {
    const user = await users().findOne({ _id: req.userId! });
    return {
      plan: user?.plan ?? null,
      status: user?.subscriptionStatus ?? "none",
      credits: user?.credits ?? 0,
      trialEndsAt: user?.trialEndsAt ?? null,
      currentPeriodEnd: user?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: Boolean(user?.cancelAtPeriodEnd),
    };
  });

  // Start a subscription (1-day free trial, card required) via Stripe Checkout.
  app.post("/billing/checkout", { preHandler: requireAuth }, async (req, reply) => {
    if (!env.stripe.enabled) return reply.code(503).send({ error: "billing_unavailable" });
    const parsed = z.object({ plan: z.enum(["starter", "growth"]) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const user = await users().findOne({ _id: req.userId! });
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    if (!user.emailVerified) return reply.code(403).send({ error: "email_unverified" });
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

  // Stripe webhook — raw body is captured by the content-type parser in index.ts.
  app.post("/webhooks/stripe", async (req, reply) => {
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
  });
}
