import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env";
import { adminLoginAttempts, adminSessions } from "../db";
import { randomToken, sha256, uid } from "../lib/crypto";

export const ADMIN_COOKIE = "rf_admin";
const SESSION_HOURS = 12;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
// Lockout: too many wrong passwords from one IP in an hour. (No account-wide lockout: that would
// let anyone lock the owner out, and the long random password already makes guessing hopeless.)
const WINDOW_MS = 60 * 60 * 1000;
const MAX_FAILS_PER_IP = 8;

/** "scrypt:<salt hex>:<hash hex>" (no "$" characters, so it is safe in any .env file). */
export function hashAdminPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Async (runs off the main thread), so a burst of login attempts can't stall the server. */
export async function verifyAdminPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, Buffer.from(saltHex, "hex"), expected.length, SCRYPT, (err, key) => (err ? reject(err) : resolve(key))),
  );
  return crypto.timingSafeEqual(actual, expected);
}

export const adminConfigured = () => Boolean(env.adminEmail && env.adminPasswordHash.startsWith("scrypt:"));

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(sha256(a)), y = Buffer.from(sha256(b));
  return crypto.timingSafeEqual(x, y);
}

export type LoginResult = { ok: true; token: string } | { ok: false; reason: "not_configured" | "locked" | "invalid" };

export async function adminLogin(emailRaw: string, password: string, ip: string): Promise<LoginResult> {
  if (!adminConfigured()) return { ok: false, reason: "not_configured" };
  const email = emailRaw.trim().toLowerCase();
  const since = new Date(Date.now() - WINDOW_MS);
  const ipFails = await adminLoginAttempts().countDocuments({ ip, ok: false, at: { $gt: since } });
  if (ipFails >= MAX_FAILS_PER_IP) return { ok: false, reason: "locked" };

  // Always run the (slow) password check so timing doesn't reveal whether the email matched.
  const passOk = await verifyAdminPassword(password, env.adminPasswordHash);
  const ok = sameText(email, env.adminEmail) && passOk;
  const attempt = adminLoginAttempts().insertOne({ _id: uid(), ip, email: ok || sameText(email, env.adminEmail) ? env.adminEmail : "other", ok, at: new Date() });
  if (!ok) {
    await attempt;
    return { ok: false, reason: "invalid" };
  }
  const token = randomToken(48);
  const now = new Date();
  await Promise.all([
    attempt,
    adminSessions().insertOne({ _id: uid(), tokenHash: sha256(token), email: env.adminEmail, ip, createdAt: now, expiresAt: new Date(now.getTime() + SESSION_HOURS * 3_600_000) }),
  ]);
  return { ok: true, token };
}

export function setAdminCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(ADMIN_COOKIE, token, {
    path: "/api/admin",
    httpOnly: true,
    sameSite: "strict",
    secure: env.isProd,
    maxAge: SESSION_HOURS * 3600,
  });
}

export function clearAdminCookie(reply: FastifyReply): void {
  reply.clearCookie(ADMIN_COOKIE, { path: "/api/admin" });
}

export async function adminFromRequest(req: FastifyRequest): Promise<string | null> {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token || !adminConfigured()) return null;
  const row = await adminSessions().findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  // A changed ADMIN_EMAIL signs out old sessions.
  return row && row.email === env.adminEmail ? row.email : null;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const email = await adminFromRequest(req);
  if (!email) return void (await reply.code(401).send({ error: "admin_required", detail: "Sign in to the admin console." }));
  reply.header("Cache-Control", "no-store");
}

export async function adminLogout(req: FastifyRequest): Promise<void> {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (token) await adminSessions().deleteOne({ tokenHash: sha256(token) });
}
