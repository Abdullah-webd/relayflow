import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authCodes, users, type User } from "../db";
import { env } from "../env";
import { randomOtp, sha256, uid } from "../lib/crypto";
import { sendEmail, brandedEmail } from "../lib/email";
import { createSession, destroyAllSessions, destroySession } from "../auth/session";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
} from "../auth/context";

const OTP_TTL_MS = 10 * 60 * 1000;

function publicUser(user: User) {
  return {
    id: user._id,
    email: user.email,
    name: user.name ?? "",
    emailVerified: user.emailVerified,
    timezone: user.timezone,
    plan: user.plan ?? null,
    subscriptionStatus: user.subscriptionStatus ?? "none",
    credits: user.credits ?? 0,
    trialEndsAt: user.trialEndsAt ?? null,
    currentPeriodEnd: user.currentPeriodEnd ?? null,
    paywallDisabled: env.paywallDisabled,
  };
}

async function issueOtp(userId: string, purpose: "verify_email" | "password_reset"): Promise<string> {
  const code = randomOtp();
  const now = new Date();
  // Invalidate any prior codes for this purpose, then store the new one (hashed).
  await authCodes().deleteMany({ userId, purpose });
  await authCodes().insertOne({
    _id: uid(),
    userId,
    purpose,
    codeHash: sha256(code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    consumedAt: null,
    createdAt: now,
  });
  return code;
}

async function consumeOtp(userId: string, purpose: "verify_email" | "password_reset", code: string): Promise<boolean> {
  const row = await authCodes().findOneAndDelete({
    userId,
    purpose,
    codeHash: sha256(code.trim()),
    expiresAt: { $gt: new Date() },
    consumedAt: null,
  });
  return Boolean(row);
}

async function deliverOtp(email: string, code: string, purpose: "verify_email" | "password_reset") {
  const what = purpose === "verify_email" ? "verification" : "password reset";
  const subject = purpose === "verify_email" ? "Your RelayFlow verification code" : "Your RelayFlow password reset code";
  const body =
    `Your RelayFlow ${what} code is:\n\n` +
    `    ${code}\n\n` +
    `It expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = brandedEmail(
    `Your ${what} code`,
    `<p style="margin:0 0 16px">Enter this code in RelayFlow to continue:</p>
     <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#101828;background:#f7f8fb;border:1px solid #e7eaf0;border-radius:12px;padding:16px;text-align:center">${code}</div>
     <p style="margin:16px 0 0;color:#98a2b3;font-size:13px">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>`,
  );
  try {
    await sendEmail(email, subject, body, html);
  } catch (error) {
    console.error(`[auth] email delivery failed for ${email}: ${(error as Error).message}`);
    // In non-production, log the code so local testing can proceed if email is down.
    console.warn(`[auth] DEV fallback — ${purpose} code for ${email}: ${code}`);
  }
}

export async function authRoutes(app: FastifyInstance) {
  const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(200),
    name: z.string().max(120).optional(),
  });

  app.post("/signup", async (req, reply) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", detail: parsed.error.issues[0]?.message });
    const email = parsed.data.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const existing = await users().findOne({ email });
    if (existing?.emailVerified) return reply.code(409).send({ error: "email_taken", detail: "An account with this email already exists." });

    const now = new Date();
    let userId: string;
    if (existing) {
      userId = existing._id;
      await users().updateOne({ _id: userId }, { $set: { passwordHash, name: parsed.data.name ?? existing.name, updatedAt: now } });
    } else {
      userId = uid();
      await users().insertOne({
        _id: userId,
        email,
        name: parsed.data.name,
        passwordHash,
        emailVerified: false,
        timezone: "Africa/Lagos",
        createdAt: now,
        updatedAt: now,
      });
    }
    const code = await issueOtp(userId, "verify_email");
    await deliverOtp(email, code, "verify_email");
    return reply.send({ status: "otp_sent", email });
  });

  app.post("/verify", async (req, reply) => {
    const schema = z.object({ email: z.string().email(), code: z.string().min(4).max(8) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await users().findOne({ email });
    if (!user) return reply.code(400).send({ error: "invalid_code", detail: "That code is invalid or expired." });
    const ok = await consumeOtp(user._id, "verify_email", parsed.data.code);
    if (!ok) return reply.code(400).send({ error: "invalid_code", detail: "That code is invalid or expired." });
    await users().updateOne({ _id: user._id }, { $set: { emailVerified: true, updatedAt: new Date() } });
    const token = await createSession(user._id);
    setSessionCookie(reply, token);
    return reply.send({ status: "verified", user: publicUser({ ...user, emailVerified: true }) });
  });

  app.post("/resend-otp", async (req, reply) => {
    const schema = z.object({ email: z.string().email(), purpose: z.enum(["verify_email", "password_reset"]).default("verify_email") });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await users().findOne({ email });
    if (user) {
      const code = await issueOtp(user._id, parsed.data.purpose);
      await deliverOtp(email, code, parsed.data.purpose);
    }
    return reply.send({ status: "sent" });
  });

  app.post("/login", async (req, reply) => {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await users().findOne({ email });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "invalid_credentials", detail: "Incorrect email or password." });
    }
    if (!user.emailVerified) {
      const code = await issueOtp(user._id, "verify_email");
      await deliverOtp(email, code, "verify_email");
      return reply.code(403).send({ error: "email_unverified", detail: "Please verify your email. We just sent you a new code.", email });
    }
    const token = await createSession(user._id);
    setSessionCookie(reply, token);
    return reply.send({ status: "authenticated", user: publicUser(user) });
  });

  app.post("/logout", async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await destroySession(token);
    clearSessionCookie(reply);
    return reply.send({ status: "logged_out" });
  });

  app.post("/forgot-password", async (req, reply) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await users().findOne({ email });
    if (!user) {
      // The user explicitly wants to know when an email isn't registered.
      return reply.send({ status: "not_registered", registered: false });
    }
    const code = await issueOtp(user._id, "password_reset");
    await deliverOtp(email, code, "password_reset");
    return reply.send({ status: "sent", registered: true });
  });

  app.post("/reset-password", async (req, reply) => {
    const schema = z.object({ email: z.string().email(), code: z.string().min(4).max(8), password: z.string().min(8).max(200) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", detail: parsed.error.issues[0]?.message });
    const email = parsed.data.email.trim().toLowerCase();
    const user = await users().findOne({ email });
    if (!user) return reply.code(400).send({ error: "invalid_code", detail: "That code is invalid or expired." });
    const ok = await consumeOtp(user._id, "password_reset", parsed.data.code);
    if (!ok) return reply.code(400).send({ error: "invalid_code", detail: "That code is invalid or expired." });
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    await users().updateOne({ _id: user._id }, { $set: { passwordHash, emailVerified: true, updatedAt: new Date() } });
    await destroyAllSessions(user._id);
    return reply.send({ status: "password_reset" });
  });

  app.get("/me", { preHandler: requireAuth }, async (req, reply) => {
    const user = await users().findOne({ _id: req.userId! });
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    return reply.send({ user: publicUser(user) });
  });

  app.patch("/profile", { preHandler: requireAuth }, async (req, reply) => {
    const schema = z.object({ name: z.string().max(120).optional(), timezone: z.string().max(64).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) set.name = parsed.data.name.trim();
    if (parsed.data.timezone !== undefined) set.timezone = parsed.data.timezone;
    await users().updateOne({ _id: req.userId! }, { $set: set });
    const user = await users().findOne({ _id: req.userId! });
    return reply.send({ user: publicUser(user!) });
  });

  app.post("/change-password", { preHandler: requireAuth }, async (req, reply) => {
    const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input", detail: parsed.error.issues[0]?.message });
    const user = await users().findOne({ _id: req.userId! });
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return reply.code(400).send({ error: "wrong_password", detail: "Your current password is incorrect." });
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await users().updateOne({ _id: user._id }, { $set: { passwordHash, updatedAt: new Date() } });
    return reply.send({ status: "password_changed" });
  });

  app.post("/logout-all", { preHandler: requireAuth }, async (req, reply) => {
    await destroyAllSessions(req.userId!);
    clearSessionCookie(reply);
    return reply.send({ status: "logged_out" });
  });
}
