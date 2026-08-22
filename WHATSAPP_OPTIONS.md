# WhatsApp: Baileys vs. the official routes (research — not yet implemented)

## The situation today
We use **Baileys**, an unofficial library that talks to WhatsApp Web's protocol by
linking as a companion device (the QR scan). It's free and can read/send in **existing
personal groups** — which is exactly what the product needs. The trade-off: it's against
WhatsApp's ToS, so the linked number carries a **real ban risk**, especially with
high-volume or spammy sending. Fine for a demo and low volume; risky as the core of a
paid product at scale.

## The options, from most official to least

### 1. WhatsApp Cloud API (Meta official) — the "right" long-term route
- Official, stable, webhook-based, no ban risk when used within policy.
- **Business-initiated messages** to a user require an approved **template** and are
  billed per conversation; free-form replies only inside a 24-hour customer-service window.
- **Groups:** the official Groups API can only manage groups **the business created**, is
  capped around **~8 participants**, and **cannot post into existing personal groups**.
  → So Cloud API does **not** cover "send to my existing WhatsApp groups." It's built for
  1:1 business↔customer messaging, not group broadcasting.
- Needs: a Meta Business account, a dedicated business phone number, business verification,
  and template approvals.

### 2. BSPs / aggregators on top of Cloud API — Twilio, 360dialog, MessageBird, Gupshup
- Same Cloud API capabilities/limits, but they handle onboarding, number provisioning,
  and billing, with nicer SDKs. Still **no existing-group posting**.

### 3. Unofficial-but-managed providers — Whapi.cloud, Wassenger, Unipile, Maytapi, 2Chat
- These wrap the **same companion-device protocol Baileys uses**, but host and babysit the
  session for you (proxy rotation, reconnection, warm-up, rate-limiting).
- They **can** send to existing groups (that's their selling point), and their
  infrastructure meaningfully **lowers ban risk vs. self-hosted Baileys** — but it is still
  unofficial, so risk is reduced, not eliminated. Paid (typically ~$20–60/mo per number).
- Migration cost from Baileys is low: swap our `whatsapp.ts` connector for their REST API;
  the rest of the app (targets, approve-before-send, agent) is unchanged.

## Recommendation
- **Keep Baileys** for the client demo and early users (it's the only free way to reach
  existing groups, and the manager already abstracts the connector).
- **Reduce ban risk now** (cheap, no provider change): send from a warmed-up number, throttle
  sends, add human-like delays, avoid bulk identical broadcasts, keep the number active on a
  real phone too. (We can add per-number rate-limiting + a send queue when you're ready.)
- **When it's revenue-critical / higher volume:** move the WhatsApp connector to a managed
  provider (Whapi/Wassenger/Unipile) for existing-group sending with lower ban risk, and/or
  add the **official Cloud API** specifically for 1:1 business↔customer flows. Telegram,
  Slack, and Gmail are already on official APIs and are not affected.

> None of this is implemented yet — this is the research you asked for. Say the word and I'll
> add send rate-limiting + a queue first (safest quick win), or prototype a managed-provider
> swap behind the existing connector interface.
