import Stripe from "stripe";
import { env } from "../env";
import { users, type SubscriptionStatus, type User } from "../db";
import { PLANS, TRIAL_DAYS, isActiveStatus, planByLookupKey, type PlanKey } from "./plans";

let client: Stripe | null = null;
export function getStripe(): Stripe {
  if (!env.stripe.enabled) throw new Error("Stripe is not configured (missing STRIPE_SECRET_KEY)");
  if (!client) client = new Stripe(env.stripe.secretKey);
  return client;
}

// ---- Prices: created lazily in Stripe, matched by a stable lookup_key so this is
// idempotent across restarts and environments (no hard-coded price ids). ----
let priceCache: Record<PlanKey, string> | null = null;
export async function ensurePrices(): Promise<Record<PlanKey, string>> {
  if (priceCache) return priceCache;
  const stripe = getStripe();
  const out = {} as Record<PlanKey, string>;
  for (const plan of Object.values(PLANS)) {
    const existing = await stripe.prices.list({ lookup_keys: [plan.lookupKey], active: true, limit: 1 });
    if (existing.data[0]) {
      out[plan.key] = existing.data[0].id;
      continue;
    }
    const product = await stripe.products.create({
      name: `RelayFlow ${plan.name}`,
      description: plan.blurb,
      metadata: { plan: plan.key },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.amountCents,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: plan.lookupKey,
      metadata: { plan: plan.key },
    });
    out[plan.key] = price.id;
  }
  priceCache = out;
  return out;
}

async function ensureCustomer(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name || undefined,
    metadata: { userId: user._id },
  });
  await users().updateOne({ _id: user._id }, { $set: { stripeCustomerId: customer.id, updatedAt: new Date() } });
  return customer.id;
}

export async function createCheckoutSession(user: User, planKey: PlanKey, origin: string): Promise<string> {
  const stripe = getStripe();
  const prices = await ensurePrices();
  const customer = await ensureCustomer(user);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user._id,
    line_items: [{ price: prices[planKey], quantity: 1 }],
    subscription_data: { trial_period_days: TRIAL_DAYS, metadata: { userId: user._id, plan: planKey } },
    // Require a card on file even though the first day is free.
    payment_method_collection: "always",
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    success_url: `${origin}/pricing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pricing?status=cancel`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalSession(user: User, origin: string): Promise<string> {
  const stripe = getStripe();
  const customer = await ensureCustomer(user);
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: `${origin}/app/settings`,
  });
  return session.url;
}

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    case "paused":
      return "incomplete";
    default:
      return "none";
  }
}

/** Write a Stripe subscription's state onto the user, granting credits once per period. */
export async function syncUserFromSubscription(userId: string, sub: Stripe.Subscription): Promise<void> {
  const item = sub.items.data[0];
  const lookupKey = item?.price?.lookup_key ?? undefined;
  const plan = lookupKey ? planByLookupKey(lookupKey) : undefined;
  const periodEndUnix: number | undefined = (item as any)?.current_period_end ?? (sub as any)?.current_period_end;
  const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

  const update: Partial<User> = {
    stripeSubscriptionId: sub.id,
    subscriptionStatus: mapStatus(sub.status),
    plan: plan?.key ?? null,
    currentPeriodEnd: periodEnd,
    trialEndsAt: trialEnd,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    updatedAt: new Date(),
  };

  // Grant this period's credits exactly once (when the period boundary advances).
  if (isActiveStatus(sub.status) && plan) {
    const existing = await users().findOne({ _id: userId });
    const prevPeriod = existing?.creditPeriodEnd ? existing.creditPeriodEnd.getTime() : 0;
    const newPeriod = periodEnd ? periodEnd.getTime() : 0;
    if (newPeriod !== prevPeriod) {
      update.credits = plan.credits;
      update.creditPeriodEnd = periodEnd;
    }
  }
  await users().updateOne({ _id: userId }, { $set: update });
}

async function userIdByCustomer(customerId: string): Promise<string | undefined> {
  const u = await users().findOne({ stripeCustomerId: customerId });
  return u?._id;
}

/**
 * Confirm a completed Checkout Session right after redirect (so billing works even
 * before webhooks are wired). Verifies the session belongs to `userId`.
 */
export async function confirmCheckout(userId: string, sessionId: string): Promise<boolean> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "subscription.items.data.price"],
  });
  if (session.client_reference_id && session.client_reference_id !== userId) return false;
  const sub = session.subscription;
  if (!sub || typeof sub === "string") return false;
  await syncUserFromSubscription(userId, sub);
  return true;
}

/** Verify + process a Stripe webhook event. Returns the event type handled. */
export async function handleWebhook(rawBody: Buffer | string, signature: string): Promise<string> {
  const stripe = getStripe();
  const event = stripe.webhooks.constructEvent(rawBody, signature, env.stripe.webhookSecret);
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.subscription) {
        const sub = await stripe.subscriptions.retrieve(s.subscription as string, { expand: ["items.data.price"] });
        const uid = s.client_reference_id || (sub.metadata?.userId as string) || (await userIdByCustomer(sub.customer as string));
        if (uid) await syncUserFromSubscription(uid, sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const uid = (sub.metadata?.userId as string) || (await userIdByCustomer(sub.customer as string));
      if (uid) await syncUserFromSubscription(uid, sub);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const subId = (inv as any).subscription as string | undefined;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
        const uid = (sub.metadata?.userId as string) || (await userIdByCustomer(sub.customer as string));
        if (uid) await syncUserFromSubscription(uid, sub);
      }
      break;
    }
  }
  return event.type;
}

/** Atomically spend `amount` credits; false if the user doesn't have enough. */
export async function tryConsumeCredits(userId: string, amount: number): Promise<boolean> {
  const res = await users().findOneAndUpdate(
    { _id: userId, credits: { $gte: amount } },
    { $inc: { credits: -amount } },
  );
  return Boolean(res);
}
