import { MongoClient, type Db, type Collection, type ObjectId } from "mongodb";
import { env } from "./env";

// ---------- Document types ----------
export type Platform = "whatsapp" | "telegram" | "slack" | "gmail";
export type ConnectionStatus =
  | "connecting"
  | "qr" // WhatsApp: waiting for a QR scan
  | "pending" // Telegram: waiting for code/2FA
  | "connected"
  | "disconnected"
  | "error";

export interface User {
  _id: string;
  email: string;
  name?: string;
  passwordHash: string;
  emailVerified: boolean;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthCode {
  _id: string;
  userId: string;
  purpose: "verify_email" | "password_reset";
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface Session {
  _id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface Chat {
  _id: string;
  userId: string;
  title: string;
  lastResponseId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  _id: string;
  chatId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  steps?: { label: string; done: boolean }[];
  toolResults?: unknown[];
  createdAt: Date;
}

export interface Connection {
  _id: string;
  userId: string;
  platform: Platform;
  status: ConnectionStatus;
  displayName: string;
  externalId: string | null;
  encryptedCredentials: string | null;
  lastError: string | null;
  heartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Destination {
  _id: string;
  userId: string;
  connectionId: string;
  platform: Platform;
  externalId: string;
  name: string;
  kind: string;
  selected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Lightweight rolling cache of recent channel messages (NOT a full history import).
export interface ChannelMessage {
  _id: string;
  userId: string;
  connectionId: string;
  platform: Platform;
  destinationId: string;
  destinationName: string;
  externalId: string;
  senderName: string;
  direction: "inbound" | "outbound";
  text: string;
  occurredAt: Date;
  createdAt: Date;
}

export interface Outbound {
  _id: string;
  userId: string;
  platform: Platform;
  connectionId: string;
  destinationExternalId: string;
  content: string;
  status: "sent" | "failed";
  externalMessageId: string | null;
  error: string | null;
  createdAt: Date;
}

export interface ScheduledTask {
  _id: string;
  userId: string;
  title: string;
  instruction: string; // natural-language instruction handed to the agent when it fires
  schedule: string; // cron expression (with optional seconds) OR "once"
  runAt: Date | null; // for one-time tasks
  timezone: string;
  active: boolean;
  lastRunAt: Date | null;
  lastResult: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Baileys auth-state key/value store (encrypted), keyed by connection.
export interface WhatsAppAuth {
  _id: string; // `${connectionId}:${keyId}`
  connectionId: string;
  keyId: string;
  ciphertext: string;
  updatedAt: Date;
}

let client: MongoClient | null = null;
let database: Db | null = null;

export async function connectDb(): Promise<Db> {
  if (database) return database;
  client = new MongoClient(env.mongoUri);
  await client.connect();
  database = client.db(env.mongoDb);
  await ensureIndexes(database);
  return database;
}

export function db(): Db {
  if (!database) throw new Error("Database not connected yet");
  return database;
}

export const users = () => db().collection<User>("users");
export const authCodes = () => db().collection<AuthCode>("auth_codes");
export const sessions = () => db().collection<Session>("sessions");
export const chats = () => db().collection<Chat>("chats");
export const chatMessages = () => db().collection<ChatMessage>("chat_messages");
export const connections = () => db().collection<Connection>("connections");
export const destinations = () => db().collection<Destination>("destinations");
export const channelMessages = () => db().collection<ChannelMessage>("channel_messages");
export const outbound = () => db().collection<Outbound>("outbound");
export const scheduledTasks = () => db().collection<ScheduledTask>("scheduled_tasks");
export const whatsappAuth = () => db().collection<WhatsAppAuth>("whatsapp_auth");

async function ensureIndexes(d: Db): Promise<void> {
  await d.collection("users").createIndex({ email: 1 }, { unique: true });
  await d.collection("auth_codes").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await d.collection("sessions").createIndex({ tokenHash: 1 }, { unique: true });
  await d.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await d.collection("chats").createIndex({ userId: 1, updatedAt: -1 });
  await d.collection("chat_messages").createIndex({ chatId: 1, createdAt: 1 });
  await d.collection("connections").createIndex({ userId: 1, platform: 1 });
  await d.collection("destinations").createIndex({ connectionId: 1, externalId: 1 }, { unique: true });
  await d.collection("channel_messages").createIndex({ userId: 1, platform: 1, occurredAt: -1 });
  await d.collection("channel_messages").createIndex({ connectionId: 1, externalId: 1 }, { unique: true });
  // Keep the recent-message cache small: auto-expire after 14 days.
  await d.collection("channel_messages").createIndex({ occurredAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });
  await d.collection("outbound").createIndex({ userId: 1, createdAt: -1 });
  await d.collection("scheduled_tasks").createIndex({ userId: 1, active: 1 });
  await d.collection("whatsapp_auth").createIndex({ connectionId: 1 });
}

export type { ObjectId, Collection };
