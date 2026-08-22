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
import { whatsappAuth, connections } from "../db";
import { encryptString, decryptString } from "../lib/crypto";
import {
  heartbeat,
  isDestinationSelected,
  recordMessage,
  setConnectionStatus,
  upsertDestination,
} from "./store";

const logger = pino({ level: "silent" });

type WaSession = {
  socket: WASocket;
  userId: string;
  qrDataUrl?: string;
  status: string;
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  closing: boolean;
};

const sessions = new Map<string, WaSession>();
const RECONNECT_BASE_MS = 1_500;
const RECONNECT_MAX_MS = 30_000;

function teardown(session: WaSession) {
  session.closing = true;
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
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

async function syncGroups(userId: string, connectionId: string, socket: WASocket): Promise<void> {
  try {
    const groups = await socket.groupFetchAllParticipating();
    for (const group of Object.values(groups)) {
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
  const prior = sessions.get(connectionId);
  if (prior) teardown(prior);

  const { state, saveCreds } = await mongoAuthState(connectionId);
  const socket = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    syncFullHistory: false, // We keep only recent, live messages — never years of history.
    keepAliveIntervalMs: 20_000,
    browser: ["RelayFlow", "Chrome", "1.0.0"],
  });
  const session: WaSession = { socket, userId, status: "connecting", reconnectAttempts: attempt, closing: false };
  sessions.set(connectionId, session);
  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async (update) => {
    if (session.closing || sessions.get(connectionId) !== session) return;
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      session.qrDataUrl = await QRCode.toDataURL(qr).catch(() => undefined);
      session.status = "qr";
      await setConnectionStatus(connectionId, "qr", { lastError: null });
    }
    if (connection === "open") {
      session.qrDataUrl = undefined;
      session.status = "connected";
      session.reconnectAttempts = 0;
      console.info(`[whatsapp] connected connection=${connectionId.slice(-8)}`);
      await setConnectionStatus(connectionId, "connected", { lastError: null, heartbeatAt: new Date() });
      await syncGroups(userId, connectionId, socket);
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

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const message of messages) {
      const jid = message.key.remoteJid;
      if (!jid?.endsWith("@g.us") || message.key.fromMe) continue; // groups only, inbound only
      const text = messageText(message.message).trim();
      if (!text) continue;
      if (!(await isDestinationSelected(connectionId, jid))) continue;
      const seconds = Number(message.messageTimestamp ?? Math.floor(Date.now() / 1000));
      await recordMessage({
        userId,
        connectionId,
        platform: "whatsapp",
        destinationId: jid,
        destinationName: jid,
        externalId: `${jid}:${message.key.id}`,
        senderName: message.pushName ?? "WhatsApp participant",
        direction: "inbound",
        text,
        occurredAt: new Date(seconds * 1000),
      });
    }
    heartbeat(connectionId).catch(() => undefined);
  });
}

export function getWhatsappQr(connectionId: string): string | undefined {
  return sessions.get(connectionId)?.qrDataUrl;
}

export function isWhatsappLive(connectionId: string): boolean {
  return sessions.get(connectionId)?.status === "connected";
}

export async function sendWhatsapp(connectionId: string, destinationExternalId: string, text: string): Promise<string | null> {
  const session = sessions.get(connectionId);
  if (!session || session.status !== "connected") throw new Error("WhatsApp is not connected");
  const sent = await session.socket.sendMessage(destinationExternalId, { text });
  return sent?.key.id ?? null;
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

export async function resumeWhatsapp(): Promise<void> {
  const rows = await connections()
    .find({ platform: "whatsapp", status: { $in: ["connected", "connecting", "qr"] } })
    .toArray();
  for (const row of rows) {
    startWhatsapp(row.userId, row._id).catch((error) =>
      console.error(`[whatsapp] resume failed ${row._id}: ${(error as Error).message}`),
    );
  }
}
