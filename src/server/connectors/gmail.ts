import { google } from "googleapis";
import { env } from "../env";
import { connections } from "../db";
import { decryptJson, decryptString, encryptJson, encryptString, uid } from "../lib/crypto";
import { upsertDestination } from "./store";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];

function oauthClient() {
  return new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, env.google.redirectUri);
}

export function gmailAuthUrl(userId: string): string {
  const state = encryptString(JSON.stringify({ userId, t: Date.now() }));
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export function readState(state: string): { userId: string } {
  return JSON.parse(decryptString(state));
}

async function gmailFor(connectionId: string) {
  const conn = await connections().findOne({ _id: connectionId });
  if (!conn?.encryptedCredentials) throw new Error("Gmail is not connected");
  const creds = decryptJson<Record<string, unknown>>(conn.encryptedCredentials);
  const auth = oauthClient();
  auth.setCredentials(creds);
  return google.gmail({ version: "v1", auth });
}

export async function completeGmailOAuth(userId: string, code: string): Promise<string> {
  const auth = oauthClient();
  const { tokens } = await auth.getToken(code);
  auth.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress || "Gmail";

  const now = new Date();
  const existing = await connections().findOne({ userId, platform: "gmail", externalId: email });
  const connectionId = existing?._id ?? uid();
  await connections().updateOne(
    { _id: connectionId },
    {
      $set: {
        userId,
        platform: "gmail",
        status: "connected",
        displayName: email,
        externalId: email,
        encryptedCredentials: encryptJson(tokens),
        lastError: null,
        heartbeatAt: now,
        updatedAt: now,
      },
      $setOnInsert: { _id: connectionId, createdAt: now },
    },
    { upsert: true },
  );
  await upsertDestination({
    userId,
    connectionId,
    platform: "gmail",
    externalId: email,
    name: `${email} (Inbox)`,
    kind: "mailbox",
  });
  return connectionId;
}

// An expired/revoked Google token (or lost scope) — the user must reconnect Gmail.
function isGmailAuthError(error: unknown): boolean {
  const e = error as any;
  const msg = (e?.message || e?.response?.data?.error || "").toString().toLowerCase();
  return e?.code === 401 || e?.response?.status === 401 || /invalid_grant|invalid_credentials|unauthorized|no refresh token|invalid authentication/.test(msg);
}

export async function fetchGmailRecent(
  connectionId: string,
  limit: number,
): Promise<{ senderName: string; text: string; occurredAt: Date }[]> {
  try {
    const gmail = await gmailFor(connectionId);
    const list = await gmail.users.messages.list({ userId: "me", q: "newer_than:7d -in:spam -in:trash", maxResults: limit });
    const out: { senderName: string; text: string; occurredAt: Date }[] = [];
    for (const ref of list.data.messages ?? []) {
      const msg = await gmail.users.messages.get({ userId: "me", id: ref.id!, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });
      const headers = msg.data.payload?.headers ?? [];
      const from = headers.find((h) => h.name === "From")?.value || "Unknown sender";
      const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
      const occurredAt = new Date(Number(msg.data.internalDate ?? Date.now()));
      out.push({ senderName: from, text: `${subject} — ${msg.data.snippet ?? ""}`, occurredAt });
    }
    return out.reverse();
  } catch (error) {
    // Surface a dead token: flip the connection to "error" so the UI shows a Reconnect
    // action and monitors can report why they went quiet — instead of failing silently.
    if (isGmailAuthError(error)) {
      await connections()
        .updateOne({ _id: connectionId }, { $set: { status: "error", lastError: "Gmail sign-in expired — reconnect Gmail", updatedAt: new Date() } })
        .catch(() => undefined);
    }
    throw error;
  }
}

export async function sendGmail(connectionId: string, to: string, subject: string, body: string): Promise<string | null> {
  const gmail = await gmailFor(connectionId);
  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
  ).toString("base64url");
  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
  return res.data.id ?? null;
}

export async function disconnectGmail(connectionId: string): Promise<void> {
  await connections().updateOne(
    { _id: connectionId },
    { $set: { status: "disconnected", encryptedCredentials: null, lastError: null, updatedAt: new Date() } },
  );
}
