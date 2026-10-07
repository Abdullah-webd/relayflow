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
- Trial user: chat list, tab motion, instant return to Chat; expired trial → paywall; Starter → knowledge upgrade prompt

## Not covered automatically (needs real accounts or money)
- Real WhatsApp/Telegram/Slack linking, real Stripe checkout/plan switch, real email delivery

## Known non-issues
- Visitors call `/api/auth/me` on every page; it answers `{ user: null }` (200), not an error.
