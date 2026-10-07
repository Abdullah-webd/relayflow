# RelayFlow — engineering rules

RelayFlow (https://userelayflow.com) is live with real users. Fastify + React/Vite + MongoDB, deployed on Railway
(project `ingenious-manifestation`, service `relayflow`) from `main` on GitHub (`Abdullah-webd/relayflow`).

## HARD RULE: release checklist (every change, no exceptions)

Nothing reaches production without passing all four stages. If any stage fails, stop and fix it — or revert.

### 1. Test locally before pushing
- `npm run verify` must pass: typecheck → build → `npm test` (the full harness) → `npm run test:visual` →
  `npm run test:e2e` (Playwright critical flows in `e2e/`). See `VERIFY.md` for the full map.
- Changes to the agent, monitors, auto-replies or AI prompts: also run `npm run test:ai` (uses the real model).
- UI changes: open the screenshots in `test-results/visual/` and look at them (desktop + phone) before pushing.
- New behavior needs new checks in `scripts/test/suites/` — the harness must cover what you changed.
- Tests use the isolated `relayflow_test` database (guarded), a dummy Stripe key and no email key. Never point
  tests at the production database, never call live Stripe, never send real messages or emails from tests.

### 2. Changes you cannot fully test locally
WhatsApp/Telegram/Slack session, identity or connection logic can't be exercised without a real account.
Never deploy these blind (a WhatsApp identity change once took WhatsApp down for ~6 minutes):
- limit the change to NEW connections only — never alter how existing sessions reconnect;
- schedule the deploy with the owner present to test with their phone, with the revert ready.

### 3. Deploy and watch Railway
- Push to `main` (GitHub Actions CI runs the same harness; Railway deploys).
- Watch `railway logs -n 300` until the new server logs `[leader] this instance now runs channel connections (<new id>)`.
- Confirm: no crash loop, WhatsApp connects once per account with no repeating close codes (440 = replaced,
  428 = rejected), no new errors.

### 4. Test the live site
- `npm run smoke:live` must pass (read-only: pages, SEO files, auth gate, webhook signature checks, assets).
- UI changes: screenshot the live pages too.
- **If anything is wrong in production: revert first (`git revert HEAD && git push`), investigate second.**

## Other standing rules
- Commits: no AI co-author trailers.
- Design: white page backgrounds; brand = logo blue (`brand-600` #0566E0 for buttons, #0573FE logo blue);
  logo assets in `src/web/public/` (`logo.png`, `logo-mark.png`). Use the `premium-ui` skill for UI work.
- Only one server may run channel sessions (`src/server/runtime/leader.ts`); never bypass the lock.
- SEO: per-page titles/descriptions live in `src/shared/seo.ts`; canonical host is `userelayflow.com`.
- Secrets never go in code or chat logs; Railway variables are set by the owner when they are secrets.
