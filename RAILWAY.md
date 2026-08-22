# Deploying RelayFlow to Railway

RelayFlow is **one always-on Node service** — the Fastify server runs the API, the AI
agent, all channel connectors, the scheduler, **and** serves the built React app. No
Redis, no separate worker, no build step at runtime (it runs TypeScript directly via `tsx`).

## 1. Create the service
1. Push `relayflow-v2/` to a GitHub repo (it already has its own git repo).
2. Railway → **New Project → Deploy from GitHub repo** → pick it.
   - If the repo root is the parent folder, set **Root Directory** = `relayflow-v2`.
3. Railway auto-detects Node. Confirm:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`   (runs `tsx src/server/index.ts`)
   - **Node version:** 20 or newer.

## 2. Environment variables (Settings → Variables)
Copy these from your local `.env` / `../.env`, with production values:

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your Mongo Atlas connection string |
| `MONGODB_DB_NAME` | `relayflow_v2` |
| `APP_SESSION_SECRET` | long random string (rotate from dev) |
| `FIELD_ENCRYPTION_MASTER_KEY` | long random string — **never change after data is stored** |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | model currently `gpt-5.6-sol` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | OTP / password emails |
| `WEB_BASE_URL` | your public URL, e.g. `https://relayflow.up.railway.app` (used for email links + Stripe redirects) |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | test keys for now |
| `STRIPE_WEBHOOK_SECRET` | from step 4 |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI` | redirect = `https://<app>/api/oauth/google/callback` |
| `SLACK_CLIENT_ID/SECRET/SIGNING_SECRET/…REDIRECT_URI` | redirect = `https://<app>/api/oauth/slack/callback` |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` | |

**Do not set `PORT`** — Railway injects it and the server already listens on `process.env.PORT` at host `0.0.0.0`.

## 3. External services
- **MongoDB Atlas:** Network Access → allow Railway's egress (simplest: `0.0.0.0/0`, or add Railway's static egress IP).
- **Google & Slack apps:** add the production redirect URIs above to the OAuth app settings (in addition to localhost).

## 4. Stripe webhook (for renewals / cancellations)
1. Deploy once so you have the public URL.
2. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
   - URL: `https://<app>/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`
3. Copy the **Signing secret** → set `STRIPE_WEBHOOK_SECRET` → redeploy.

> Even before the webhook is wired, a new subscription activates immediately because the
> app confirms the Checkout session on the success redirect. The webhook keeps things in
> sync for renewals, failed payments, and cancellations.

## 5. Verify after deploy
- `https://<app>/api/health` → `{"status":"ok"}`
- Landing page loads, signup → OTP email arrives → verify → **redirected to /pricing**.
- Start trial with Stripe **test card `4242 4242 4242 4242`** (any future expiry, any CVC/ZIP) → land in the dashboard with 500 credits.
- Connect WhatsApp (scan QR) → ask the agent to send to a group.

## Notes
- **Scheduling** runs in-process (`node-cron`) and works because the service is always-on.
  Tasks live in Mongo, so a redeploy never loses them — the next minute-tick runs anything due.
  Keep the service on a plan that does not sleep.
- **WhatsApp** auth is stored (encrypted) in Mongo, so the session survives redeploys; on
  boot the server reconnects automatically. Large-group sends that were flaky on a laptop
  network should complete on Railway's stable network.
