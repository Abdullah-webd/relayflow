import makeWASocket, {
  DisconnectReason,
  initAuthCreds,
  BufferJSON,
  type AuthenticationState,
  type SignalDataTypeMap,
  type WASocket,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import { whatsappAuth, connections, destinations, channelMessages } from "../db";
import { encryptString, decryptString } from "../lib/crypto";
import { heartbeat, setConnectionStatus, upsertDestination } from "./store";
import { ingestMessage, type ChatKind } from "./ingest";
import { isLeader } from "../runtime/leader";

const logger = pino({ level: "silent" });

type WaSession = {
  socket: WASocket;
  userId: string;
  qrDataUrl?: string;
  status: string;
  linking?: boolean; // QR scanned, pairing/syncing behind the scenes (not yet "open")
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  stableTimer?: ReturnType<typeof setTimeout>;
  closing: boolean;
};

const sessions = new Map<string, WaSession>();
// Baileys queries WhatsApp for group metadata on every group send and BLOCKS on it;
// caching that metadata (per the Baileys docs) is what makes group sends actually return.
const groupMetaCache = new Map<string, any>();
// Contact display names seen via contacts/history events, per connection (for private chats).
const contactNames = new Map<string, string>();
const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;

function teardown(session: WaSession) {
  session.closing = true;
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  if (session.stableTimer) clearTimeout(session.stableTimer);
  try {
    session.socket.ev.removeAllListeners("connection.update");
  } catch {
    /* noop */
  }
  try {
    session.socket.end(undefined);
  } catch {
    /* noop */
  }
}

function messageText(message: any): string {
  if (!message) return "";
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  return messageText(
    message.ephemeralMessage?.message ?? message.viewOnceMessage?.message ?? message.viewOnceMessageV2?.message,
  );
}

async function mongoAuthState(connectionId: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const col = whatsappAuth();
  const read = async <T>(keyId: string): Promise<T | undefined> => {
    const row = await col.findOne({ _id: `${connectionId}:${keyId}` });
    return row ? (JSON.parse(decryptString(row.ciphertext), BufferJSON.reviver) as T) : undefined;
  };
  const write = async (keyId: string, value: unknown): Promise<void> => {
    await col.updateOne(
      { _id: `${connectionId}:${keyId}` },
      { $set: { connectionId, keyId, ciphertext: encryptString(JSON.stringify(value, BufferJSON.replacer)), updatedAt: new Date() } },
      { upsert: true },
    );
  };
  const remove = async (keyId: string): Promise<void> => {
    await col.deleteOne({ _id: `${connectionId}:${keyId}` });
  };

  const creds = (await read<AuthenticationState["creds"]>("creds")) ?? initAuthCreds();
  const state: AuthenticationState = {
    creds,
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const output: { [id: string]: SignalDataTypeMap[T] } = {};
        for (const id of ids) {
          const value = await read<SignalDataTypeMap[T]>(`${type}-${id}`);
          if (value) output[id] = value;
        }
        return output;
      },
      set: async (data) => {
        for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
          for (const [id, value] of Object.entries(data[category] ?? {})) {
            const keyId = `${category}-${id}`;
            if (value) await write(keyId, value);
            else await remove(keyId);
          }
        }
      },
    },
  };
  return { state, saveCreds: () => write("creds", state.creds) };
}

/** groups → "group"; private chats (phone or LID addressing) → "dm"; everything else ignored. */
function chatKindOf(jid: string | null | undefined): ChatKind | null {
  if (!jid) return null;
  if (jid.endsWith("@g.us")) return "group";
  if (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid")) return "dm";
  return null; // status@broadcast, newsletters, broadcast lists
}

function rememberContact(connectionId: string, c: any) {
  const name = c?.name || c?.notify || c?.verifiedName;
  if (c?.id && name) contactNames.set(`${connectionId}|${c.id}`, String(name));
}

/** A group's subject from cache, else ask WhatsApp (5s cap). */
async function groupSubject(connectionId: string, jid: string): Promise<string | null> {
  const cached = groupMetaCache.get(jid)?.subject;
  if (cached) return cached;
  const session = sessions.get(connectionId);
  if (!session || session.status !== "connected") return null;
  try {
    const meta: any = await Promise.race([
      session.socket.groupMetadata(jid),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5_000)),
    ]);
    if (meta?.subject) {
      groupMetaCache.set(jid, meta);
      return meta.subject;
    }
  } catch {
    /* left the group or no access — keep the generic label */
  }
  return null;
}

/** Name chats that were stored without a proper name (older data, or groups seen before sync). */
async function repairChatNames(userId: string, connectionId: string): Promise<void> {
  const ids: string[] = await channelMessages().distinct("destinationId", { connectionId });
  for (const jid of ids) {
    if (!jid.endsWith("@g.us")) continue;
    const dest = await destinations().findOne({ connectionId, externalId: jid });
    if (dest && dest.name && dest.name !== "Chat" && !dest.name.includes("@")) continue;
    const subject = await groupSubject(connectionId, jid);
    if (subject) await upsertDestination({ userId, connectionId, platform: "whatsapp", externalId: jid, name: subject, kind: "group" });
  }
}

/** Display name → saved contact name → phone number (never a generic "participant"). */
function senderNameFor(connectionId: string, message: any, kind: ChatKind, chatName: string | null): string {
  if (message.pushName) return message.pushName;
  if (kind === "dm" && chatName) return chatName;
  const participant: string | undefined = message.key?.participantPn || message.key?.participant || message.participant;
  if (participant) {
    const saved = contactNames.get(`${connectionId}|${participant}`);
    if (saved) return saved;
    const digits = participant.split("@")[0].split(":")[0];
    if (/^\d{7,15}$/.test(digits) && participant.endsWith("@s.whatsapp.net")) return `+${digits}`;
  }
  return "Group member";
}

async function ingestWaMessage(userId: string, connectionId: string, message: any, history: boolean): Promise<void> {
  const jid: string | undefined = message?.key?.remoteJid;
  const kind = chatKindOf(jid);
  if (!kind || !jid) return;
  const text = messageText(message.message).trim();
  if (!text) return;
  const fromMe = Boolean(message.key.fromMe);
  const seconds = Number(message.messageTimestamp ?? Math.floor(Date.now() / 1000));
  let chatName: string | null = null;
  if (kind === "group") chatName = history ? groupMetaCache.get(jid)?.subject ?? null : await groupSubject(connectionId, jid);
  else chatName = (!fromMe && message.pushName) || contactNames.get(`${connectionId}|${jid}`) || null;
  await ingestMessage({
    userId,
    connectionId,
    platform: "whatsapp",
    chatId: jid,
    chatName,
    chatKind: kind,
    messageId: String(message.key.id),
    senderName: senderNameFor(connectionId, message, kind, chatName),
    fromMe,
    text,
    occurredAt: new Date(seconds * 1000),
    history,
  });
}

async function syncGroups(userId: string, connectionId: string, socket: WASocket): Promise<void> {
  try {
    const groups = await socket.groupFetchAllParticipating();
    for (const group of Object.values(groups)) {
      groupMetaCache.set(group.id, group); // cache metadata so sends don't block
      await upsertDestination({
        userId,
        connectionId,
        platform: "whatsapp",
        externalId: group.id,
        name: group.subject || "WhatsApp group",
        kind: "group",
      });
    }
  } catch {
    /* groups can be fetched again later */
  }
}

export async function startWhatsapp(userId: string, connectionId: string, attempt = 0): Promise<void> {
  // Only the server holding the background lock may open WhatsApp sessions (see runtime/leader.ts).
  if (!isLeader()) throw new Error("RelayFlow is restarting — please try again in a few seconds.");
  const prior = sessions.get(connectionId);
  if (prior) teardown(prior);

  const { state, saveCreds } = await mongoAuthState(connectionId);
  const socket = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: true,
    syncFullHistory: false, // We keep only recent, live messages — never years of history.
    keepAliveIntervalMs: 20_000,
    browser: ["RelayFlow", "Chrome", "1.0.0"],
    // REQUIRED for reliable group sends — otherwise sendMessage blocks fetching metadata.
    cachedGroupMetadata: async (jid) => groupMetaCache.get(jid),
    getMessage: async () => undefined,
  });
  const session: WaSession = { socket, userId, status: "connecting", reconnectAttempts: attempt, closing: false };
  sessions.set(connectionId, session);
  socket.ev.on("creds.update", async () => {
    await saveCreds();
    // Once the account identity (`me`) is present but we're not "open" yet, the QR has
    // been scanned and WhatsApp is pairing/syncing. Drop the stale QR and flip to "linking"
    // so the UI can show real progress instead of a dead QR code.
    if (state.creds?.me && session.status !== "connected" && !session.linking) {
      session.qrDataUrl = undefined;
      session.linking = true;
      await setConnectionStatus(connectionId, "connecting", { lastError: null }).catch(() => undefined);
    }
  });

  socket.ev.on("connection.update", async (update) => {
    if (session.closing || sessions.get(connectionId) !== session) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      session.qrDataUrl = await QRCode.toDataURL(qr).catch(() => undefined);
      session.status = "qr";
      session.linking = false;
      await setConnectionStatus(connectionId, "qr", { lastError: null });
    }
    if (connection === "open") {
      session.qrDataUrl = undefined;
      session.linking = false;
      session.status = "connected";
      // Only reset the backoff after the connection stays up for a while. Resetting
      // immediately made a flapping connection reconnect fast and hammer WhatsApp (408).
      if (session.stableTimer) clearTimeout(session.stableTimer);
      session.stableTimer = setTimeout(() => {
        session.reconnectAttempts = 0;
      }, 60_000);
      session.stableTimer.unref?.();
      console.info(`[whatsapp] connected connection=${connectionId.slice(-8)}`);
      await setConnectionStatus(connectionId, "connected", { lastError: null, heartbeatAt: new Date() });
      await syncGroups(userId, connectionId, socket);
      repairChatNames(userId, connectionId).catch(() => undefined);
    }
    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.warn(`[whatsapp] closed connection=${connectionId.slice(-8)} code=${statusCode ?? "?"} loggedOut=${loggedOut}`);
      if (loggedOut) {
        teardown(session);
        sessions.delete(connectionId);
        await whatsappAuth().deleteMany({ connectionId });
        await setConnectionStatus(connectionId, "disconnected", { lastError: "logged_out" });
        return;
      }
      const nextAttempt = session.reconnectAttempts + 1;
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** session.reconnectAttempts);
      await setConnectionStatus(connectionId, "connecting", { lastError: `reconnecting (code ${statusCode ?? "?"})` });
      teardown(session);
      const timer = setTimeout(() => {
        startWhatsapp(userId, connectionId, nextAttempt).catch((error) =>
          console.error(`[whatsapp] reconnect failed ${connectionId}: ${(error as Error).message}`),
        );
      }, delay);
      timer.unref();
      session.reconnectTimer = timer;
    }
  });

  // Every message — groups AND private chats, including ones you send from your phone —
  // goes through the shared pipeline (store + instant auto-replies/monitors).
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const message of messages) {
      await ingestWaMessage(userId, connectionId, message, type !== "notify").catch((e) =>
        console.error(`[whatsapp] ingest failed: ${(e as Error).message}`),
      );
    }
    heartbeat(connectionId).catch(() => undefined);
  });

  // Recent history WhatsApp sends right after linking/reconnecting: store it (no alerts).
  socket.ev.on("messaging-history.set", async ({ messages, contacts }: any) => {
    for (const c of contacts ?? []) rememberContact(connectionId, c);
    let stored = 0;
    for (const message of messages ?? []) {
      await ingestWaMessage(userId, connectionId, message, true).then(() => stored++).catch(() => undefined);
    }
    if (messages?.length) console.info(`[whatsapp] history sync connection=${connectionId.slice(-8)} messages=${messages.length}`);
  });
  socket.ev.on("contacts.upsert", (contacts: any[]) => contacts.forEach((c) => rememberContact(connectionId, c)));
  socket.ev.on("contacts.update", (contacts: any[]) => contacts.forEach((c) => rememberContact(connectionId, c)));

  // Keep the group-metadata cache fresh so group sends stay fast and never block.
  socket.ev.on("groups.update", async (updates) => {
    for (const update of updates) {
      if (!update.id) continue;
      try {
        groupMetaCache.set(update.id, await socket.groupMetadata(update.id));
      } catch {
        /* keep old cache */
      }
    }
  });
  socket.ev.on("group-participants.update", async (event) => {
    try {
      groupMetaCache.set(event.id, await socket.groupMetadata(event.id));
    } catch {
      /* keep old cache */
    }
  });
}

export function getWhatsappQr(connectionId: string): string | undefined {
  return sessions.get(connectionId)?.qrDataUrl;
}

/** Coarse connect phase for the UI: qr → linking → connected (or connecting/disconnected). */
export function getWhatsappPhase(connectionId: string): string {
  const s = sessions.get(connectionId);
  if (!s) return "connecting";
  if (s.status === "connected") return "connected";
  if (s.linking) return "linking";
  if (s.qrDataUrl) return "qr";
  return "connecting";
}

export function isWhatsappLive(connectionId: string): boolean {
  return sessions.get(connectionId)?.status === "connected";
}

export async function sendWhatsapp(connectionId: string, destinationExternalId: string, text: string): Promise<string | null> {
  const session = sessions.get(connectionId);
  if (!session) throw new Error("WhatsApp session not running — reconnect WhatsApp");
  if (session.status !== "connected") throw new Error("WhatsApp is not connected yet — try again in a moment");
  console.info(`[whatsapp] sending to ${destinationExternalId} connection=${connectionId.slice(-8)}`);
  // Baileys sendMessage can hang if the socket is degraded; never let a send stall the request.
  // Larger groups need more time on the first send (WhatsApp encrypts per member).
  const sent = await Promise.race([
    session.socket.sendMessage(destinationExternalId, { text }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("WhatsApp send timed out")), 60_000)),
  ]);
  console.info(`[whatsapp] sent id=${(sent as any)?.key?.id ?? "?"}`);
  return (sent as any)?.key?.id ?? null;
}

export async function disconnectWhatsapp(connectionId: string): Promise<void> {
  const session = sessions.get(connectionId);
  if (session) {
    try {
      await session.socket.logout();
    } catch {
      teardown(session);
    }
    sessions.delete(connectionId);
  }
  await whatsappAuth().deleteMany({ connectionId });
  await setConnectionStatus(connectionId, "disconnected", { lastError: null });
}

/** Close every live session WITHOUT logging out (another server is taking over). */
export async function stopAllWhatsapp(): Promise<void> {
  for (const session of sessions.values()) teardown(session);
  sessions.clear();
}

export async function resumeWhatsapp(): Promise<void> {
  const rows = await connections()
    .find({ platform: "whatsapp", status: { $in: ["connected", "connecting", "qr"] } })
    .toArray();
  for (const row of rows) {
    // Only resume connections that actually have saved credentials — otherwise a stale
    // "connected" row with no auth spins in an endless reconnect (408) loop.
    const hasCreds = await whatsappAuth().findOne({ _id: `${row._id}:creds` });
    if (!hasCreds) {
      await setConnectionStatus(row._id, "disconnected", { lastError: "no_credentials" });
      continue;
    }
    startWhatsapp(row.userId, row._id).catch((error) =>
      console.error(`[whatsapp] resume failed ${row._id}: ${(error as Error).message}`),
    );
  }
}

// Exposed for tests.
export { ingestWaMessage as _ingestWaMessage };
