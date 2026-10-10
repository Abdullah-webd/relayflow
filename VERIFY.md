# Verification map

Live URL: https://userelayflow.com
Deploy: push to `main` → GitHub Actions CI (same checks) → Railway deploys (enable "Wait for CI").
Start for tests: `npm run build`, then the harnesses start the server themselves on isolated `*_test` databases.

## Before every push
- `npm run verify` → typecheck, build, `npm test` (harness), `npm run test:visual` (pages + signed-in dashboard), `npm run test:e2e` (Playwright critical flows)
- Agent/monitor/AI changes: `npm run test:ai`
- Whole-site crawl (writes `.verify/report.json`, required by the ship-gate hook):
  `TEST_DB_NAME=relayflow_smoke_test TEST_PORT=8789 npx tsx scripts/test/serve.ts &` then
  `node ~/.claude/skills/ship-verify/scripts/smoke.mjs http://localhost:8789 --out .verify --paths /,/pricing,/signup,/login,/privacy,/terms,/forgot,/app/chat`

## After every deploy
- `railway logs -n 300`: new server logs `[leader] this instance now runs channel connections (<new id>)`; WhatsApp connects once, no 440/428 loops
- `npm run smoke:live` and `BASE_URL=https://userelayflow.com npx playwright test` (read-only tests run; seeded ones skip)
- `node ~/.claude/skills/ship-verify/scripts/smoke.mjs https://userelayflow.com --out .verify/live`

## Critical flows (e2e/critical-flows.spec.ts)
- Public: home, pricing ($15/$30), legal pages, real 404
- Sign-up requires Terms/Privacy consent; wrong password shows an error
- Trial user: Overview home (chart, setup checklist); chat list, tab motion, instant return to Chat
- Auto-reply: create → pick a group → add knowledge → save rules → go live (blocked with a reason until ready)
- Expired trial → paywall; Starter → auto-replies upgrade prompt (old /app/knowledge redirects)

## Try the dashboard locally with demo data (never touches real data)
- `TEST_DB_NAME=relayflow_demo_test npx tsx scripts/test/demo-seed.ts`
- `TEST_DB_NAME=relayflow_demo_test TEST_PORT=8790 npx tsx scripts/test/serve.ts` → http://localhost:8790, demo@relayflow.test / demo-password
- Screenshots of every page: `SHOTS_OUT=dir npx tsx scripts/test/shots.ts`

## Not covered automatically (needs real accounts or money)
- Real WhatsApp/Telegram/Slack linking, real Stripe checkout/plan switch, real email delivery

## Known non-issues
- Visitors call `/api/auth/me` on every page; it answers `{ user: null }` (200), not an error.

## Report tab + admin console
- Users report problems at /app/reports; the owner gets an email; the admin console shows them live.
- Admin console: /admin (own login: ADMIN_EMAIL + ADMIN_PASSWORD_HASH env vars; make them with
  `npx tsx scripts/admin-password.ts <email> <file>`). Without both set, /admin says sign-in isn't set up.
- Tests use a separate test admin login (scripts/test/admin-creds.ts), never the real one.
- Local demo with the real admin login: `USE_REAL_ADMIN=1 TEST_DB_NAME=relayflow_demo_test TEST_PORT=8790 npx tsx scripts/test/serve.ts`
- Admin screenshots (test login): `SHOTS_URL=http://localhost:8791 npx tsx scripts/test/admin-shots.ts`
