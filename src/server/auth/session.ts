import { sessions } from "../db";
import { randomToken, sha256, uid } from "../lib/crypto";

const SESSION_DAYS = 30;

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  const now = new Date();
  await sessions().insertOne({
    _id: uid(),
    userId,
    tokenHash: sha256(token),
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000),
  });
  return token;
}

export async function authenticateToken(token: string): Promise<string | null> {
  const row = await sessions().findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } });
  return row?.userId ?? null;
}

export async function destroySession(token: string): Promise<void> {
  await sessions().deleteOne({ tokenHash: sha256(token) });
}

export async function destroyAllSessions(userId: string): Promise<void> {
  await sessions().deleteMany({ userId });
}
