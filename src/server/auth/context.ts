import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env";
import { authenticateToken } from "./session";
import { users } from "../db";
import { isActiveStatus } from "../billing/plans";

export const SESSION_COOKIE = "rf_session";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

export async function loadUser(req: FastifyRequest): Promise<string | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  const userId = await authenticateToken(token);
  req.userId = userId ?? undefined;
  return userId;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = await loadUser(req);
  if (!userId) {
    await reply.code(401).send({ error: "unauthorized" });
  }
}

/**
 * Hard gate for every dashboard/agent API: the caller must be authenticated, have a
 * verified email, AND hold an active or trialing subscription. Anything less is
 * rejected here on the server — the client route guard is only a convenience layer.
 */
export async function requireActivePlan(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = await loadUser(req);
  if (!userId) return void (await reply.code(401).send({ error: "unauthorized" }));
  // When Stripe isn't configured (local dev without keys), don't lock people out.
  if (!env.stripe.enabled) return;
  const user = await users().findOne({ _id: userId });
  if (!user) return void (await reply.code(401).send({ error: "unauthorized" }));
  if (!user.emailVerified) return void (await reply.code(403).send({ error: "email_unverified" }));
  // Launch mode: verified users get in without a subscription.
  if (env.paywallDisabled) return;
  if (!isActiveStatus(user.subscriptionStatus)) {
    return void (await reply.code(402).send({ error: "subscription_required", detail: "An active plan or trial is required." }));
  }
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}
