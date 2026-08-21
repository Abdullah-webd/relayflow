import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env";
import { connections, destinations } from "../db";
import { uid } from "../lib/crypto";
import { requireAuth } from "../auth/context";
import { listUserConnections, disconnectConnection } from "../connectors/manager";
import { startWhatsapp, getWhatsappQr } from "../connectors/whatsapp";
import { startTelegram, verifyTelegramCode, verifyTelegram2FA } from "../connectors/telegram";
import { slackAuthUrl, completeSlackOAuth, readState as slackState } from "../connectors/slack";
import { gmailAuthUrl, completeGmailOAuth, readState as gmailState } from "../connectors/gmail";

const redirectDone = (platform: string) => `${env.webBaseUrl || ""}/app/connections?connected=${platform}`;
const redirectError = (platform: string) => `${env.webBaseUrl || ""}/app/connections?error=${platform}`;

export async function connectionRoutes(app: FastifyInstance) {
  app.get("/connections", { preHandler: requireAuth }, async (req) => {
    return { connections: await listUserConnections(req.userId!) };
  });

  app.get("/connections/:id/destinations", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await connections().findOne({ _id: id, userId: req.userId! });
    if (!conn) return reply.code(404).send({ error: "not_found" });
    const rows = await destinations().find({ connectionId: id }).sort({ name: 1 }).toArray();
    return { destinations: rows.map((d) => ({ id: d._id, name: d.name, kind: d.kind, selected: d.selected !== false })) };
  });

  app.patch("/connections/:id/destinations", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ selectedIds: z.array(z.string()) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    const conn = await connections().findOne({ _id: id, userId: req.userId! });
    if (!conn) return reply.code(404).send({ error: "not_found" });
    await destinations().updateMany({ connectionId: id }, { $set: { selected: false, updatedAt: new Date() } });
    if (body.data.selectedIds.length) {
      await destinations().updateMany(
        { connectionId: id, _id: { $in: body.data.selectedIds } },
        { $set: { selected: true, updatedAt: new Date() } },
      );
    }
    return { status: "ok" };
  });

  app.delete("/connections/:id", { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    await disconnectConnection(req.userId!, id);
    return { status: "disconnected" };
  });

  // ---------- WhatsApp ----------
  app.post("/connections/whatsapp", { preHandler: requireAuth }, async (req) => {
    const userId = req.userId!;
    const now = new Date();
    let conn = await connections().findOne({ userId, platform: "whatsapp" });
    if (!conn) {
      const id = uid();
      await connections().insertOne({
        _id: id, userId, platform: "whatsapp", status: "connecting", displayName: "WhatsApp",
        externalId: null, encryptedCredentials: null, lastError: null, heartbeatAt: null, createdAt: now, updatedAt: now,
      });
      conn = (await connections().findOne({ _id: id }))!;
    } else {
      await connections().updateOne({ _id: conn._id }, { $set: { status: "connecting", updatedAt: now } });
    }
    await startWhatsapp(userId, conn._id);
    return { id: conn._id };
  });

  app.get("/connections/whatsapp/:id/qr", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const conn = await connections().findOne({ _id: id, userId: req.userId! });
    if (!conn) return reply.code(404).send({ error: "not_found" });
    return { status: conn.status, qr: getWhatsappQr(id) ?? null };
  });

  // ---------- Telegram ----------
  app.post("/connections/telegram", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ phone: z.string().min(6).max(20) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input", detail: "Enter a valid phone number with country code." });
    const userId = req.userId!;
    const now = new Date();
    let conn = await connections().findOne({ userId, platform: "telegram" });
    if (!conn) {
      const id = uid();
      await connections().insertOne({
        _id: id, userId, platform: "telegram", status: "connecting", displayName: body.data.phone,
        externalId: null, encryptedCredentials: null, lastError: null, heartbeatAt: null, createdAt: now, updatedAt: now,
      });
      conn = (await connections().findOne({ _id: id }))!;
    } else {
      await connections().updateOne({ _id: conn._id }, { $set: { status: "connecting", displayName: body.data.phone, updatedAt: now } });
    }
    try {
      await startTelegram(conn._id, body.data.phone);
    } catch (error) {
      return reply.code(400).send({ error: "telegram_error", detail: (error as Error).message });
    }
    return { id: conn._id, status: "pending" };
  });

  app.post("/connections/telegram/:id/code", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ code: z.string().min(3).max(10) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    try {
      const status = await verifyTelegramCode(id, req.userId!, body.data.code);
      return { status };
    } catch (error) {
      return reply.code(400).send({ error: "telegram_error", detail: (error as Error).message });
    }
  });

  app.post("/connections/telegram/:id/2fa", { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ password: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_input" });
    try {
      await verifyTelegram2FA(id, req.userId!, body.data.password);
      return { status: "connected" };
    } catch (error) {
      return reply.code(400).send({ error: "telegram_error", detail: (error as Error).message });
    }
  });

  // ---------- Slack OAuth ----------
  app.get("/connections/slack/start", { preHandler: requireAuth }, async (req, reply) => {
    if (!env.slack.clientId) return reply.code(400).send({ error: "not_configured", detail: "Slack is not configured." });
    return { url: slackAuthUrl(req.userId!) };
  });

  app.get("/oauth/slack/callback", async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string };
    if (query.error || !query.code || !query.state) return reply.redirect(redirectError("slack"));
    try {
      const { userId } = slackState(query.state);
      await completeSlackOAuth(userId, query.code);
      return reply.redirect(redirectDone("slack"));
    } catch (error) {
      console.error("[slack.callback]", (error as Error).message);
      return reply.redirect(redirectError("slack"));
    }
  });

  // ---------- Gmail OAuth ----------
  app.get("/connections/gmail/start", { preHandler: requireAuth }, async (req, reply) => {
    if (!env.google.clientId) return reply.code(400).send({ error: "not_configured", detail: "Gmail is not configured." });
    return { url: gmailAuthUrl(req.userId!) };
  });

  app.get("/oauth/google/callback", async (req, reply) => {
    const query = req.query as { code?: string; state?: string; error?: string };
    if (query.error || !query.code || !query.state) return reply.redirect(redirectError("gmail"));
    try {
      const { userId } = gmailState(query.state);
      await completeGmailOAuth(userId, query.code);
      return reply.redirect(redirectDone("gmail"));
    } catch (error) {
      console.error("[gmail.callback]", (error as Error).message);
      return reply.redirect(redirectError("gmail"));
    }
  });
}
