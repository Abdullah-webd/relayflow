# RelayFlow

One AI agent across every business messaging channel — WhatsApp, Telegram, Slack, Gmail.
Ask about recent conversations, and send one message everywhere, with an approve-before-send step.

## Stack
- **Backend:** Fastify + TypeScript (API, SSE agent streaming, connectors, webhooks) — runs via `tsx`.
- **Frontend:** React + Vite + Tailwind (served by the same server in production).
- **Database:** MongoDB.
- **AI:** OpenAI (Responses API).
- **Connectors:** WhatsApp = Baileys · Telegram = GramJS · Slack = `@slack/web-api` · Gmail = `googleapis`.
- **Scheduling:** in-process `node-cron` + a tasks collection (no Redis).

One always-on Node service — ideal for Railway.

## Run locally
```bash
npm install
# Secrets are read from ../.env (shared) plus this folder's .env (overrides).
npm run dev      # Vite on :5173 (proxies /api to the API), API on :8000
```
Open http://localhost:5173

## Production / Railway
```bash
npm run build    # builds the React app into dist/public
npm start        # tsx src/server/index.ts — serves API + the built app on $PORT
```
Set env vars on Railway (see `.env.example` in the parent repo): `MONGODB_URI`, `MONGODB_DB_NAME`,
`OPENAI_API_KEY`, `OPENAI_MODEL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_SESSION_SECRET`,
`FIELD_ENCRYPTION_MASTER_KEY`, `WEB_BASE_URL`, and the Google/Slack/Telegram credentials.
Set `WEB_BASE_URL` to your Railway URL and register the OAuth redirect URIs
(`/api/oauth/google/callback`, `/api/oauth/slack/callback`) with Google/Slack.

## Features
- Email/password auth with 6-digit OTP email verification, login, and password reset (via Resend).
- Multiple chat sessions with server-side context (OpenAI `previous_response_id`).
- Live agent activity feed (shows what it's doing, with counts).
- Connect flows: WhatsApp QR, Telegram phone/code/2FA, Slack & Gmail OAuth; clear connected/disconnected status.
- Recent-only message reading (no bulk history import).
- Draft → approve → send, including "send to all channels".
- Scheduled tasks that run an instruction and email you the result.
