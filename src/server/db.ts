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

export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export interface User {
  _id: string;
  email: string;
  name?: string;
  passwordHash: string;
  emailVerified: boolean;
  timezone: string;
  // ---- Billing ----
  plan?: "starter" | "growth" | null;
  subscriptionStatus?: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  credits?: number;
  creditPeriodEnd?: Date | null; // period boundary the current credit grant belongs to
  createdAt: Date;
  updatedAt: Date;
}

// Small singleton store for app-wide config (e.g. cached Stripe price ids).
export interface AppConfig {
  _id: string;
  [key: string]: unknown;
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
export const appConfig = () => db().collection<AppConfig>("app_config");

/**
 * Create an index, but never crash the whole server if an equivalent index already
 * exists under a different name/options (e.g. a database seeded by the old app). Those
 * conflicts (codes 85/86) mean the constraint is already in place, so we just warn.
 */
async function safeIndex(
  d: Db,
  collection: string,
  keys: Record<string, 1 | -1>,
  options?: Record<string, unknown>,
): Promise<void> {
  try {
    await d.collection(collection).createIndex(keys as any, options);
  } catch (error) {
    const code = (error as { code?: number }).code;
    const message = (error as Error).message || "";
    if (code === 85 || code === 86 || /already exists/i.test(message)) {
      console.warn(`[db] index on ${collection} (${Object.keys(keys).join(",")}) already exists with different name/options — keeping the existing one.`);
      return;
    }
    throw error;
  }
}

async function ensureIndexes(d: Db): Promise<void> {
  await safeIndex(d, "users", { email: 1 }, { unique: true });
  await safeIndex(d, "auth_codes", { expiresAt: 1 }, { expireAfterSeconds: 0 });
  await safeIndex(d, "sessions", { tokenHash: 1 }, { unique: true });
  await safeIndex(d, "sessions", { expiresAt: 1 }, { expireAfterSeconds: 0 });
  await safeIndex(d, "chats", { userId: 1, updatedAt: -1 });
  await safeIndex(d, "chat_messages", { chatId: 1, createdAt: 1 });
  await safeIndex(d, "connections", { userId: 1, platform: 1 });
  await safeIndex(d, "destinations", { connectionId: 1, externalId: 1 }, { unique: true });
  await safeIndex(d, "channel_messages", { userId: 1, platform: 1, occurredAt: -1 });
  await safeIndex(d, "channel_messages", { connectionId: 1, externalId: 1 }, { unique: true });
  // Keep the recent-message cache small: auto-expire after 14 days.
  await safeIndex(d, "channel_messages", { occurredAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });
  await safeIndex(d, "outbound", { userId: 1, createdAt: -1 });
  await safeIndex(d, "scheduled_tasks", { userId: 1, active: 1 });
  await safeIndex(d, "whatsapp_auth", { connectionId: 1 });
}

export type { ObjectId, Collection };
