// Test environment. Imported FIRST by every test entry point, before any server module, so
// these values win over .env (dotenv never overrides variables that are already set).
const DB = process.env.TEST_DB_NAME || "relayflow_test";
if (!DB.endsWith("_test")) throw new Error(`Refusing to run tests against non-test database "${DB}"`);
Object.assign(process.env, {
  NODE_ENV: "test",
  MONGODB_DB_NAME: DB,
  PORT: process.env.TEST_PORT || "8787",
  PAYWALL_DISABLED: "false",
  DISABLE_BACKGROUND: "true", // never open real WhatsApp/Telegram sessions from tests
  STRIPE_SECRET_KEY: "sk_test_dummy_never_called", // enables paywall logic; no Stripe calls are made
  STRIPE_WEBHOOK_SECRET: "whsec_test_dummy",
  RESEND_API_KEY: "", // never send real email from tests
  SLACK_SIGNING_SECRET: "test-signing-secret",
  GMAIL_ENABLED: "false",
});
// Test-only admin login (the real credentials are never used by tests).
import crypto from "node:crypto";
import { TEST_ADMIN } from "./admin-creds";
export { TEST_ADMIN };
// USE_REAL_ADMIN=1 (local demo only) keeps the real admin login from .env instead.
if (process.env.USE_REAL_ADMIN !== "1") {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(TEST_ADMIN.password, salt, 64, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  process.env.ADMIN_EMAIL = TEST_ADMIN.email;
  process.env.ADMIN_PASSWORD_HASH = `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}
if (process.env.TEST_AI !== "1") process.env.OPENAI_API_KEY = ""; // AI calls only in `npm run test:ai`
export const TEST_DB = DB;
export const API = `http://localhost:${process.env.PORT}`;
