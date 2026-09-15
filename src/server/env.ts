import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Local overrides first (relayflow-v2/.env), then the shared repo .env with the real
// secrets. dotenv never overrides variables already set by the platform (Railway).
dotenv.config({ path: resolve(here, "../../.env") });
dotenv.config({ path: resolve(here, "../../../.env") });

const str = (name: string, fallback = ""): string => process.env[name] ?? fallback;
const num = (name: string, fallback: number): number => {
  const value = process.env[name];
  return value ? Number(value) : fallback;
};

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  get isProd() {
    return this.nodeEnv === "production";
  },
  port: num("PORT", 8000),
  // Where the browser-facing app lives (for email links). Dev: Vite. Prod: same origin.
  webBaseUrl: str("WEB_BASE_URL", str("NODE_ENV") === "production" ? "" : "http://localhost:5173"),

  sessionSecret: str("APP_SESSION_SECRET", "dev-only-insecure-session-secret-change-me"),
  fieldKey: str("FIELD_ENCRYPTION_MASTER_KEY", "dev-only-insecure-field-key-change-me"),

  mongoUri: str("MONGODB_URI", "mongodb://localhost:27017"),
  mongoDb: str("MONGODB_DB_NAME", "relayflow_v2"),

  openaiApiKey: str("OPENAI_API_KEY"),
  openaiModel: str("OPENAI_MODEL", "gpt-4o"),
  // Optional OpenAI-compatible base URL (e.g. DeepSeek) — lets us swap providers by config.
  openaiBaseUrl: str("OPENAI_BASE_URL"),

  resendApiKey: str("RESEND_API_KEY"),
  resendFrom: str("RESEND_FROM_EMAIL", "RelayFlow <onboarding@resend.dev>"),
  resendReplyTo: str("RESEND_REPLY_TO"),

  google: {
    clientId: str("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: str("GOOGLE_OAUTH_CLIENT_SECRET"),
    // Reuse the redirect URI already registered in the user's Google app.
    redirectUri: str("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:8000/api/oauth/google/callback"),
  },
  slack: {
    clientId: str("SLACK_CLIENT_ID"),
    clientSecret: str("SLACK_CLIENT_SECRET"),
    signingSecret: str("SLACK_SIGNING_SECRET"),
    redirectUri: str("SLACK_OAUTH_REDIRECT_URI", "http://localhost:8000/api/oauth/slack/callback"),
  },
  telegram: {
    apiId: num("TELEGRAM_API_ID", 0),
    apiHash: str("TELEGRAM_API_HASH"),
  },
  stripe: {
    secretKey: str("STRIPE_SECRET_KEY"),
    publishableKey: str("STRIPE_PUBLISHABLE_KEY"),
    webhookSecret: str("STRIPE_WEBHOOK_SECRET"),
    get enabled() {
      return this.secretKey.startsWith("sk_");
    },
  },
  // Temporary launch switch: when true, verified users get full access without paying,
  // and AI credits are not enforced. Set PAYWALL_DISABLED=true to open the app; remove it
  // (or set false) to turn the paywall back on — no code changes needed.
  paywallDisabled: str("PAYWALL_DISABLED").toLowerCase() === "true",
  get creditsEnforced(): boolean {
    return this.stripe.enabled && !this.paywallDisabled;
  },
};

export type Env = typeof env;
