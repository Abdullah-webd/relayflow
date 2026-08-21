import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { computeCheck } from "telegram/Password";
import { env } from "../env";
import { connections } from "../db";
import { decryptJson, encryptJson } from "../lib/crypto";
import { setConnectionStatus, upsertDestination } from "./store";

type LoginState = { client: TelegramClient; phone: string; phoneCodeHash: string };
const loginClients = new Map<string, LoginState>();
const liveClients = new Map<string, TelegramClient>();

function newClient(session = ""): TelegramClient {
  return new TelegramClient(new StringSession(session), env.telegram.apiId, env.telegram.apiHash, {
    connectionRetries: 5,
    autoReconnect: true,
  });
}

export async function startTelegram(connectionId: string, phone: string): Promise<void> {
  if (!env.telegram.apiId || !env.telegram.apiHash) throw new Error("Telegram API credentials are not configured");
  const client = newClient();
  await client.connect();
  const result: any = await client.sendCode({ apiId: env.telegram.apiId, apiHash: env.telegram.apiHash }, phone);
  loginClients.set(connectionId, { client, phone, phoneCodeHash: result.phoneCodeHash });
  await setConnectionStatus(connectionId, "pending", { lastError: null });
}

async function completeLogin(connectionId: string, userId: string, client: TelegramClient): Promise<void> {
  const session = client.session.save() as unknown as string;
  await connections().updateOne(
    { _id: connectionId },
    { $set: { encryptedCredentials: encryptJson({ session }), status: "connected", lastError: null, updatedAt: new Date() } },
  );
  loginClients.delete(connectionId);
  liveClients.set(connectionId, client);
  await syncDialogs(connectionId, userId, client);
}

export async function verifyTelegramCode(connectionId: string, userId: string, code: string): Promise<"connected" | "needs_2fa"> {
  const login = loginClients.get(connectionId);
  if (!login) throw new Error("Login session expired — start again.");
  try {
    await login.client.invoke(
      new Api.auth.SignIn({ phoneNumber: login.phone, phoneCodeHash: login.phoneCodeHash, phoneCode: code }),
    );
  } catch (error: any) {
    if (String(error?.errorMessage) === "SESSION_PASSWORD_NEEDED") {
      await setConnectionStatus(connectionId, "pending", { lastError: "needs_2fa" });
      return "needs_2fa";
    }
    throw new Error("That code is invalid or expired.");
  }
  await completeLogin(connectionId, userId, login.client);
  return "connected";
}

export async function verifyTelegram2FA(connectionId: string, userId: string, password: string): Promise<void> {
  const login = loginClients.get(connectionId);
  if (!login) throw new Error("Login session expired — start again.");
  const pwd = await login.client.invoke(new Api.account.GetPassword());
  const check = await computeCheck(pwd, password);
  await login.client.invoke(new Api.auth.CheckPassword({ password: check }));
  await completeLogin(connectionId, userId, login.client);
}

async function syncDialogs(connectionId: string, userId: string, client: TelegramClient): Promise<void> {
  try {
    const dialogs = await client.getDialogs({ limit: 60 });
    for (const dialog of dialogs) {
      if (!(dialog.isGroup || dialog.isChannel)) continue;
      const id = String(dialog.id);
      await upsertDestination({
        userId,
        connectionId,
        platform: "telegram",
        externalId: id,
        name: dialog.title || dialog.name || "Telegram chat",
        kind: dialog.isChannel && !dialog.isGroup ? "channel" : "group",
      });
    }
  } catch {
    /* retry later */
  }
}

async function getLiveClient(connectionId: string): Promise<TelegramClient> {
  const existing = liveClients.get(connectionId);
  if (existing && existing.connected) return existing;
  const conn = await connections().findOne({ _id: connectionId });
  if (!conn?.encryptedCredentials) throw new Error("Telegram is not connected");
  const { session } = decryptJson<{ session: string }>(conn.encryptedCredentials);
  const client = newClient(session);
  await client.connect();
  liveClients.set(connectionId, client);
  return client;
}

export async function fetchTelegramRecent(
  connectionId: string,
  chatExternalId: string,
  limit: number,
): Promise<{ senderName: string; text: string; occurredAt: Date }[]> {
  const client = await getLiveClient(connectionId);
  const messages = await client.getMessages(chatExternalId, { limit });
  const out: { senderName: string; text: string; occurredAt: Date }[] = [];
  for (const m of messages) {
    const text = (m.message || "").trim();
    if (!text) continue;
    const sender: any = await m.getSender().catch(() => null);
    const senderName =
      [sender?.firstName, sender?.lastName].filter(Boolean).join(" ") || sender?.title || sender?.username || "Telegram user";
    out.push({ senderName, text, occurredAt: new Date((m.date || 0) * 1000) });
  }
  return out.reverse();
}

export async function sendTelegram(connectionId: string, chatExternalId: string, text: string): Promise<string | null> {
  const client = await getLiveClient(connectionId);
  const sent = await client.sendMessage(chatExternalId, { message: text });
  return sent?.id ? String(sent.id) : null;
}

export async function disconnectTelegram(connectionId: string): Promise<void> {
  const client = liveClients.get(connectionId);
  if (client) {
    try {
      await client.invoke(new Api.auth.LogOut());
    } catch {
      /* noop */
    }
    try {
      await client.disconnect();
    } catch {
      /* noop */
    }
    liveClients.delete(connectionId);
  }
  loginClients.delete(connectionId);
  await connections().updateOne(
    { _id: connectionId },
    { $set: { status: "disconnected", encryptedCredentials: null, lastError: null, updatedAt: new Date() } },
  );
}

export async function resumeTelegram(): Promise<void> {
  const rows = await connections().find({ platform: "telegram", status: "connected" }).toArray();
  for (const row of rows) {
    getLiveClient(row._id).catch((error) =>
      console.error(`[telegram] resume failed ${row._id}: ${(error as Error).message}`),
    );
  }
}
