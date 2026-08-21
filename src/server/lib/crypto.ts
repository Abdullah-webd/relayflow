import crypto from "node:crypto";
import { env } from "../env";

// Derive a stable 32-byte key from whatever the master key string is.
const key = crypto.createHash("sha256").update(env.fieldKey).digest();

export function encryptString(plaintext: string): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, body]).toString("base64");
}

export function decryptString(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const nonce = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const body = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

export const encryptJson = (value: unknown): string => encryptString(JSON.stringify(value));
export const decryptJson = <T>(payload: string): T => JSON.parse(decryptString(payload)) as T;

export const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
export const randomToken = (bytes = 32): string => crypto.randomBytes(bytes).toString("base64url");
export const randomOtp = (): string => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
export const uid = (): string => crypto.randomUUID();
