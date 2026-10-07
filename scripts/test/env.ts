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
if (process.env.TEST_AI !== "1") process.env.OPENAI_API_KEY = ""; // AI calls only in `npm run test:ai`
export const TEST_DB = DB;
export const API = `http://localhost:${process.env.PORT}`;
