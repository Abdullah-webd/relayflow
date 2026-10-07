import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { computeCheck } from "telegram/Password";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import { env } from "../env";
import { connections } from "../db";
import { decryptJson, encryptJson } from "../lib/crypto";
import { setConnectionStatus, upsertDestination } from "./store";
import { ingestMessage, type ChatKind } from "./ingest";
import { isLeader } from "../runtime/leader";

type LoginState = { client: TelegramClient; phone: string; phoneCodeHash: string };
const loginClients = new Map<string, LoginState>();
const liveClients = new Map<string, TelegramClient>();
const connecting = new Map<string, Promise<TelegramClient>>();

// Errors meaning the stored Telegram session is dead and the user must sign in again.
const DEAD_SESSION = /AUTH_KEY_DUPLICATED|AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED|AUTH_KEY_INVALID/;
const RESTARTING = "RelayFlow is restarting — please try again in a few seconds.";

function newClient(session = ""): TelegramClient {
  return new TelegramClient(new StringSession(session), env.telegram.apiId, env.telegram.apiHash, {
    connectionRetries: 5,
    autoReconnect: true,
  });
}

async function markSessionDead(connectionId: string, reason: string): Promise<void> {
  console.warn(`[telegram] session dead connection=${connectionId.slice(-8)}: ${reason}`);
  const client = liveClients.get(connectionId);
  liveClients.delete(connectionId);
  client?.disconnect().catch(() => undefined);
  await setConnectionStatus(connectionId, "error", { lastError: "Telegram signed RelayFlow out. Reconnect Telegram to continue." });
}

function senderNameOf(sender: any): string {
  return [sender?.firstName, sender?.lastName].filter(Boolean).join(" ") || sender?.title || sender?.username || "Telegram user";
}

function chatInfo(chat: any, msg: any): { kind: ChatKind; name: string | null } {
  if (msg?.isPrivate) return { kind: "dm", name: chat ? senderNameOf(chat) : null };
  if (msg?.isGroup) return { kind: "group", name: chat?.title ?? null };
  return { kind: "channel", name: chat?.title ?? null };
}

async function ingestTelegramMessage(userId: string, connectionId: string, msg: any, history: boolean): Promise<void> {
  const text = String(msg?.message || "").trim();
  if (!text || msg?.chatId === undefined) return;
  const chat = await msg.getChat().catch(() => null);
  const sender = msg.out ? null : await msg.getSender().catch(() => null);
  const { kind, name } = chatInfo(chat, msg);
  await ingestMessage({
    userId,
    connectionId,
    platform: "telegram",
    chatId: String(msg.chatId),
    chatName: name,
    chatKind: kind,
    messageId: String(msg.id),
    senderName: sender ? senderNameOf(sender) : name || "Telegram user",
    fromMe: Boolean(msg.out),
    text,
    occurredAt: new Date((msg.date || 0) * 1000),
    history,
  });
}

/** Live listener: every new message (groups, channels, private chats) goes into the pipeline. */
function attachListener(client: TelegramClient, connectionId: string, userId: string): void {
  client.addEventHandler(async (event: NewMessageEvent) => {
    try {
      await ingestTelegramMessage(userId, connectionId, event.message, false);
    } catch (e) {
      console.error(`[telegram] ingest failed: ${(e as Error).message}`);
    }
  }, new NewMessage({}));
}

/** Register chats and store recent messages (catch-up after connect or a restart). */
async function syncRecent(connectionId: string, userId: string, client: TelegramClient): Promise<void> {
  try {
    const dialogs = await client.getDialogs({ limit: 50 });
    const since = Date.now() - 14 * 24 * 60 * 60 * 1000;
    let fetched = 0;
    for (const dialog of dialogs) {
      const kind: ChatKind = dialog.isUser ? "dm" : dialog.isGroup ? "group" : "channel";
      const id = String(dialog.id);
      await upsertDestination({ userId, connectionId, platform: "telegram", externalId: id, name: dialog.title || dialog.name || "Telegram chat", kind });
      // Dialogs come newest-activity first; fetch recent messages from the active ones.
      if (fetched < 25 && (dialog.date || 0) * 1000 >= since) {
        fetched++;
        const msgs = await client.getMessages(dialog.entity, { limit: 15 });
        for (const m of msgs) await ingestTelegramMessage(userId, connectionId, m, true).catch(() => undefined);
      }
    }
    await connections().updateOne({ _id: connectionId }, { $set: { syncedAt: new Date() } });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    if (DEAD_SESSION.test(msg)) await markSessionDead(connectionId, msg);
    else console.error(`[telegram] sync failed connection=${connectionId.slice(-8)}: ${msg}`);
  }
}

export async function startTelegram(connectionId: string, phone: string): Promise<void> {
  if (!env.telegram.apiId || !env.telegram.apiHash) throw new Error("Telegram API credentials are not configured");
  if (!isLeader()) throw new Error(RESTARTING);
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
  attachListener(client, connectionId, userId);
  syncRecent(connectionId, userId, client).catch(() => undefined);
}

export async function verifyTelegramCode(connectionId: string, userId: string, code: string): Promise<"connected" | "needs_2fa"> {
  const login = loginClients.get(connectionId);
  if (!login) throw new Error("Login session expired — start again.");
  try {
    await login.client.invoke(new Api.auth.SignIn({ phoneNumber: login.phone, phoneCodeHash: login.phoneCodeHash, phoneCode: code }));
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

/**
 * The single live client for a connection. Only the lock-holding server may open one: two
 * servers using the same session makes Telegram revoke it (AUTH_KEY_DUPLICATED).
 */
async function getLiveClient(connectionId: string): Promise<TelegramClient> {
  const existing = liveClients.get(connectionId);
  if (existing && existing.connected) return existing;
  if (!isLeader()) throw new Error(RESTARTING);
  const inflight = connecting.get(connectionId);
  if (inflight) return inflight;
  const p = (async () => {
    const conn = await connections().findOne({ _id: connectionId });
    if (!conn?.encryptedCredentials) throw new Error("Telegram is not connected");
    const { session } = decryptJson<{ session: string }>(conn.encryptedCredentials);
    const client = newClient(session);
    try {
      await client.connect();
      await client.getMe(); // fails fast if Telegram has revoked the session
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (DEAD_SESSION.test(msg)) await markSessionDead(connectionId, msg);
      client.disconnect().catch(() => undefined);
      throw e;
    }
    liveClients.set(connectionId, client);
    attachListener(client, connectionId, conn.userId);
    return client;
  })();
  connecting.set(connectionId, p);
  try {
    return await p;
  } finally {
    connecting.delete(connectionId);
  }
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
    const sender: any = m.out ? null : await m.getSender().catch(() => null);
    out.push({ senderName: m.out ? "You" : senderNameOf(sender), text, occurredAt: new Date((m.date || 0) * 1000) });
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

/** Close live clients WITHOUT logging out (another server is taking over). */
export async function stopAllTelegram(): Promise<void> {
  for (const client of liveClients.values()) await client.disconnect().catch(() => undefined);
  liveClients.clear();
}

/** On startup (lock holder only): reopen each session, listen live, and catch up recent messages. */
export async function resumeTelegram(): Promise<void> {
  const rows = await connections().find({ platform: "telegram", status: "connected" }).toArray();
  for (const row of rows) {
    getLiveClient(row._id)
      .then((client) => syncRecent(row._id, row.userId, client))
      .catch((error) => console.error(`[telegram] resume failed ${row._id.slice(-8)}: ${(error as Error).message}`));
  }
}

// Exposed for tests.
export { ingestTelegramMessage as _ingestTelegramMessage };
