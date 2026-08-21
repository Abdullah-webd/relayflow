import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env";
import { authenticateToken } from "./session";

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
