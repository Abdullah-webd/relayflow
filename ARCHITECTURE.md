# RelayFlow — How It All Works

> A plain-English tour of the whole system, for anyone (even a first-week developer).
> The diagrams below render as drawings on GitHub.

---

## 1. What RelayFlow is, in one sentence

**RelayFlow is one AI assistant you chat with that can read and send messages across all your business channels — WhatsApp, Telegram, Slack, and Gmail — from a single place, and never sends anything without your approval.**

Think of it as a **smart chief-of-staff** sitting on top of your messaging apps. You talk to it in a chat box; it reads your groups, summarises them, drafts replies, sends to one group or all of them at once, runs things on a schedule, and watches channels for you.

---

## 2. The big picture

Everything runs as **one always-on program** (a "server") hosted on Railway. That one program does everything: it serves the website, runs the AI, talks to the messaging apps, handles payments, and sends emails.

```mermaid
flowchart TD
  U["User's browser<br/>(the RelayFlow website)"] -->|HTTPS| S

  subgraph RW["Railway — ONE always-on Node.js service"]
    S["Fastify server<br/>API + serves the website"]
    AG["AI Agent"]
    SCH["Scheduler<br/>(ticks every minute)"]
    CON["Channel connectors"]
    S --- AG
    S --- SCH
    S --- CON
  end

  S -->|"stores & reads data"| DB[("MongoDB<br/>(the database)")]
  AG -->|"thinks / decides"| OAI["OpenAI API"]
  S -->|"payments"| ST["Stripe"]
  S -->|"sends emails"| RS["Resend"]
  CON <-->|"read & send messages"| WA["WhatsApp"]
  CON <-->|"read & send messages"| TG["Telegram"]
  CON <-->|"read & send messages"| SL["Slack"]
  CON <-->|"read & send messages"| GM["Gmail"]
```

**Analogy:** the **server** is a restaurant kitchen. The **database** is the filing cabinet where everything is written down. **OpenAI** is the clever brain the kitchen phones for advice. **Stripe** is the cashier. **Resend** is the postman. The **connectors** are staff who go out and talk to WhatsApp/Telegram/Slack/Gmail.

---

## 3. The pieces (each explained simply)

| Piece | Plain English | Tech used |
|---|---|---|
| **Website (frontend)** | The pages you see and click — login, chat, connections, settings. | React + Vite + Tailwind |
| **Server (backend)** | The engine that answers every request and does the real work. | Fastify (Node.js), run with `tsx` |
| **Database** | The notebook that remembers users, chats, messages, monitors, etc. | MongoDB |
| **AI Agent** | The "brain" that reads your request and decides what to do. | OpenAI (model `gpt-5.6-sol`) |
| **Connectors** | The adapters that plug into each messaging app. | Baileys (WhatsApp), GramJS (Telegram), Slack API, Gmail API |
| **Scheduler** | A clock that wakes up every minute to run scheduled tasks & monitors. | node-cron |
| **Payments** | Free trials, plans, and credits. | Stripe |
| **Email** | OTP codes, password resets, monitor alerts. | Resend |

---

## 4. How a chat message flows (the core loop)

This is the heart of RelayFlow. When you type something in the chat:

```mermaid
sequenceDiagram
  actor User
  participant Web as Website
  participant API as Server
  participant Agent
  participant OpenAI
  participant DB as Database

  User->>Web: "Summarise today's WhatsApp"
  Web->>API: send the message
  API->>API: Check: logged in? active plan? has credits?
  API->>Agent: run the request
  Agent->>OpenAI: here's the request + the tools you may use
  OpenAI-->>Agent: "use the tool: get_recent_messages"
  Agent->>DB: fetch recent messages
  Agent->>OpenAI: here are the messages
  OpenAI-->>Agent: a clean summary
  Agent-->>API: stream the answer word by word
  API-->>Web: live text (and an Approve card if it wants to send)
  Web-->>User: shows the answer
```

**Key idea — "tools":** the AI can't do anything on its own. It's only allowed to use a small, fixed set of **tools** we gave it:

- `list_connections` — which channels are connected?
- `list_destinations` — list my groups/channels by name.
- `get_recent_messages` — read recent messages (about the last week only).
- `prepare_send` — draft a message for me to approve (does **not** send).
- `prepare_schedule` — set up a timed task for me to approve.
- `prepare_monitor` — set up a watch for me to approve.

Because the toolbox is small and fixed, the AI stays on-task. If you ask it for something off-topic (e.g. "write me a landing page"), it politely refuses — that's a rule baked into its instructions.

---

## 5. Signing up & logging in (Auth)

```mermaid
flowchart LR
  A["Sign up<br/>(email + password)"] --> B["6-digit code<br/>emailed via Resend"]
  B --> C["Enter code<br/>= email verified"]
  C --> D["Login session created<br/>(cookie: rf_session)"]
  D --> E{"Active plan<br/>or trial?"}
  E -- "no" --> F["Sent to Pricing"]
  E -- "yes" --> G["Dashboard"]
```

**In words:** you sign up, we email you a 6-digit code (OTP) to prove the email is yours. Once verified, we hand your browser a secret **session cookie** (`rf_session`) — like a wristband that says "this person is logged in." Passwords are stored **scrambled** (bcrypt), never in plain text. The wristband is checked on every request.

---

## 6. Payments & access control (Billing + gating)

RelayFlow is a paid product, so the dashboard is **locked** until you're on a plan.

```mermaid
flowchart TD
  L["Logged-in user"] --> Q{"Email verified?"}
  Q -- "no" --> V["Verify email first"]
  Q -- "yes" --> P{"Active plan or trial?"}
  P -- "no" --> PR["Pricing page →<br/>Stripe Checkout<br/>1-day free trial, card required"]
  P -- "yes" --> D["Dashboard unlocked"]
  PR --> W["Stripe confirms →<br/>plan active + credits granted"]
  W --> D
```

**In words:**
- Two plans: **Starter ($10/mo, 500 credits)** and **Growth ($30/mo, 2,000 credits)**.
- Everyone starts a **1-day free trial** (card required, not charged during the trial).
- A **credit** = one AI action. Each agent reply or monitor check that needs the AI uses one.
- **The lock is enforced on the server, not just the screen.** Every dashboard request runs through a gate (`requireActivePlan`): no login → blocked; email not verified → blocked; no active plan → blocked with a "payment required" signal. So nobody can sneak in by fiddling with the browser.
- **Stripe** handles the card and subscription; **webhooks** keep us updated when payments renew or fail.

---

## 7. Connecting your channels (Connectors)

Each messaging app connects differently, but once connected they all behave the same to the rest of the app.

```mermaid
flowchart TD
  subgraph How each one connects
    WA["WhatsApp<br/>scan a QR code<br/>(Baileys, live socket)"]
    TG["Telegram<br/>phone number + code<br/>(GramJS)"]
    SL["Slack<br/>click Authorize<br/>(official OAuth)"]
    GM["Gmail<br/>click Authorize<br/>(official OAuth)"]
  end
  WA --> M["Connectors layer<br/>(one common interface)"]
  TG --> M
  SL --> M
  GM --> M
  M --> R["Rest of the app<br/>reads recent messages<br/>and sends messages"]
```

**In words:**
- **WhatsApp** links by scanning a QR code (like WhatsApp Web). After you scan, there's a short "Linking…" wait while it pairs.
- **Telegram** logs in with your phone number + the code Telegram sends you.
- **Slack** and **Gmail** use official "click to authorize" (OAuth) buttons.
- We only keep a **lightweight, recent slice** of messages (about a week) — never years of history.
- Login secrets for each channel are **encrypted** (AES-256-GCM) before being saved.

---

## 8. Sending a message (draft → approve → deliver)

This is the safety-critical part. **The AI never sends on its own.**

```mermaid
sequenceDiagram
  actor User
  participant Agent
  participant Web as Website
  participant API as Server
  participant Channel

  User->>Agent: "Send 'Good morning' to my Study group"
  Agent->>Web: prepare_send → shows a preview card
  Note over Web: Nothing has been sent yet
  User->>Web: clicks "Approve & send"
  Web->>API: confirm the send
  API->>Channel: actually deliver the message
  Channel-->>API: delivered ✓ (or failed)
  API-->>Web: shows "Sent ✓" and remembers it
```

**In words:** the agent shows you a **preview card** with the exact message and destination. Only when you click **Approve** does it actually go out. Smart bits:
- **One channel, many groups = one button.** Different channels = one button each.
- After you approve, the result ("Sent ✓") is **saved**, so refreshing the page won't show the button again (no accidental double-sends).

---

## 9. Scheduled tasks (do something on a timer)

```mermaid
flowchart LR
  A["You: 'every morning at 8am<br/>greet my WhatsApp group'"] --> B["Approve card → saved task"]
  B --> C["Scheduler wakes every minute"]
  C --> D{"Any task due now?"}
  D -- "yes" --> E["Agent runs it<br/>(auto-sends, since pre-approved)"]
  E --> F["Emails you a 'done' note"]
  D -- "no" --> C
```

**In words:** you set it up once and approve it. A clock (node-cron) checks every minute for tasks that are due and runs them automatically. Because you pre-approved a scheduled task, it can send without asking each time.

---

## 10. Monitors (watch a channel and tell me when something happens)

The newest feature. **It checks on an interval and only pings you when a condition is truly met — never a message-by-message firehose.**

```mermaid
flowchart TD
  S["Every minute: any monitor due?<br/>(default every 30 min, min 15)"] --> N{"New messages<br/>since last check?"}
  N -- "no" --> Z["Do nothing<br/>(free — no AI used)"]
  N -- "yes" --> J["Ask the AI: do any of these<br/>match the condition?<br/>(e.g. 'someone asks about cloth')"]
  J -- "no match" --> Z
  J -- "match!" --> E["Email you once"]
```

**In words:** you say *"let me know when someone asks about cloth in the Dev group."* Every 30 minutes RelayFlow peeks at what's new. If nothing new arrived, it does nothing (costs nothing). If there are new messages, the AI reads them and decides — *semantically* — whether any match (so "do you sell fabric?" counts even without the word "cloth"). It emails you **only on a real match**. There's also an **"absence" mode**: "tell me if the delivery confirmation *doesn't* arrive by tomorrow."

---

## 11. What's stored (the database, simply)

MongoDB holds a few "collections" (think: labelled drawers):

| Drawer | What's in it |
|---|---|
| `users` | accounts, plan, credits, billing status |
| `sessions` | who's logged in (the wristbands) |
| `auth_codes` | the 6-digit OTP codes (expire fast) |
| `chats` / `chat_messages` | your chat sessions and their messages |
| `connections` / `destinations` | your linked channels and their groups |
| `channel_messages` | the recent-messages cache (auto-deletes after 14 days) |
| `outbound` | a log of everything sent |
| `scheduled_tasks` | your timed tasks |
| `monitors` | your channel watches |
| `whatsapp_auth` | encrypted WhatsApp login state |

---

## 12. What keeps it safe (Security)

- **Passwords**: stored scrambled with bcrypt (never readable).
- **Sessions**: a random secret in an httpOnly cookie the browser can't leak to scripts.
- **Channel secrets**: encrypted (AES-256-GCM) at rest.
- **The paywall & login checks run on the server** — the screen hiding a button is just convenience; the server is the real guard.
- **The AI can only use its fixed toolbox**, and **can't send anything without your Approve click** — that guarantee is in the code, not just the AI's instructions. So even a tricky "prompt injection" hidden inside a group message can't make it fire off a message on its own.

---

## 13. How it's deployed

- **One service on Railway.** The same program serves the website and runs the API, agent, scheduler, and connectors. No separate servers, no Redis — cheap and simple.
- It runs the TypeScript directly with `tsx` (no separate build step for the server); the website is built once into static files the server hands out.
- Because it's **always on**, the scheduler and monitors keep ticking, and WhatsApp stays connected.

---

## 14. 🆕 Proposed feature: Knowledge Base + Auto-Reply

> **Status: designed, not yet built.** This section is the plan so you can see how it will work before we implement it.

### What it is (plain English)
Today RelayFlow answers **you** in the chat. This feature lets it answer **your customers** — automatically, on the channels you choose, using facts **you** give it.

A company adds a **Knowledge tab**, uploads or types their facts (products in stock, prices, opening hours, address, terms), writes **guardrails** ("answer product & pricing questions; never discuss refunds or give legal advice"), and flips on **auto-reply** for the channels they want. From then on, when a customer messages one of those channels, RelayFlow reads the message, checks the knowledge base, and — **only if it's confident the answer is in there and allowed** — replies on its own. If it's unsure, it stays quiet and leaves it for a human.

**The golden rule of this feature: silence beats a wrong answer.** A confident, grounded reply goes out; anything doubtful is left alone.

### Setup — the Knowledge tab

```mermaid
flowchart TD
  O["Company owner"] --> KT["New: Knowledge tab"]
  KT --> U1["Upload a PDF<br/>(we extract the text)"]
  KT --> U2["Paste text<br/>(products, hours, address, T&Cs)"]
  KT --> G["Write guardrails<br/>'answer pricing & hours;<br/>never discuss refunds'"]
  KT --> CH["Toggle auto-reply per channel<br/>(only the ones you pick)"]
  U1 --> S["Save"]
  U2 --> S
  G --> S
  CH --> S
  S --> KB[("Knowledge base<br/>stored + searchable")]
```

### The auto-reply pipeline (where the safety lives)

```mermaid
flowchart TD
  M["Customer message arrives on an<br/>auto-reply-enabled channel"] --> F{"From a real person?<br/>(not us, not the AI,<br/>not a repeat, within rate limit)"}
  F -- "no" --> X["Ignore"]
  F -- "yes" --> R["Find the most relevant facts<br/>from the knowledge base"]
  R --> J["AI decides:<br/>1) Can I answer confidently<br/>   FROM these facts?<br/>2) Do the guardrails allow it?"]
  J -- "not confident / not allowed" --> Q["Stay silent — leave it for the<br/>humans already on the channel<br/>(no emails, no alerts)"]
  J -- "confident AND allowed" --> A["Send the grounded reply<br/>automatically, then log it"]
```

The AI is told: **only use the provided facts. If the answer isn't clearly in them, do not answer.** That's what stops it from making things up to a real customer.

### Where it plugs into each channel

```mermaid
flowchart LR
  WA["WhatsApp<br/>(live socket)"] -->|"real-time"| P["Auto-reply pipeline"]
  TG["Telegram"] -->|"near-real-time<br/>(polled)"| P
  SL["Slack"] -->|"near-real-time<br/>(polled)"| P
  GM["Gmail"] -->|"near-real-time<br/>(polled)"| P
  P --> KB[("Knowledge base<br/>+ guardrails")]
```

**Honest note on "real-time":** WhatsApp already has a live connection, so it's truly instant. Telegram/Slack/Gmail would start as **near-real-time** (checked on a short interval, reusing the same engine that powers monitors), and can become fully live later. So auto-reply on WhatsApp is the strongest first version.

### What gets stored

| New drawer | What's in it |
|---|---|
| `knowledge_base` | the guardrails/instructions + settings, per company |
| `knowledge_docs` | each uploaded/typed document's text (and, in Phase 2, searchable "chunks") |
| `connections` (existing, +field) | `autoReplyEnabled` on/off per channel, plus a mode (see below) |
| `auto_replies` | a log of every incoming question, the reply, and the confidence — so you can audit what the AI said |

### How it finds the right facts (retrieval)
- **Phase 1 (simple):** if the knowledge is small (a few pages), we hand the AI the **whole knowledge base** with each question. Easy, works immediately.
- **Phase 2 (scales):** for big knowledge bases, we split documents into chunks, turn them into **embeddings** (numerical meaning), and use **MongoDB Atlas Vector Search** to fetch only the few most relevant chunks per question. This keeps it fast and cheap even with hundreds of pages. (We already use Atlas, so this is a natural upgrade.)

### Safety & the "don't be reckless" design
Auto-reply means the AI sends **without you approving each message** — that's the point, and you opted in per channel. So the protections are:
- **Confidence gate** — replies only when the answer is clearly grounded in your facts; otherwise silent.
- **Guardrails** — your "answer this / never that" rules are enforced every time.
- **No loops** — it never replies to its own messages or your outgoing ones; rate-limited and de-duplicated so one customer never gets spammed.
- **Full log** — every auto-reply is recorded so you can review what it said (in the Knowledge tab).
- **Quiet when unsure — on purpose.** It does **not** email or alert you for questions it can't answer. RelayFlow **augments** your team; it doesn't replace them. The people on the channel are still there and will see anything the AI left alone — peppering them with "couldn't answer" emails would be noise, so we don't.
- **Credits** — each incoming message on an auto-reply channel may use a credit (an AI check), so cost scales with volume.
- **"Suggest mode" (future option)** — a later toggle to have it draft and wait for approval instead of sending, for companies that want to ease in.

### Decided (locked in)
- **Groups, exactly as today — no DM change.** Auto-reply runs inside the **selected groups** on each connected channel. Nothing about how channels connect changes.
- **Full auto** from day one: confident, grounded replies send immediately (no per-message approval).
- **When unsure → stay completely silent. No emails, no alerts.** The humans on the channel handle anything the AI can't. RelayFlow augments the team, it doesn't replace them.
- **All four channels.** WhatsApp is truly real-time (live socket); Telegram/Slack/Gmail are near-real-time (short polling, same engine as monitors).

### Suggested phases
- **Phase 1 (MVP):** Knowledge tab (paste text + PDF upload → extracted text) · guardrails · per-channel auto-reply toggle · **WhatsApp** real-time auto-reply · whole-KB-in-prompt · confidence gate · silent-when-unsure · reply log.
- **Phase 2:** near-real-time auto-reply on Telegram/Slack/Gmail · Atlas Vector Search for large knowledge bases · optional "Suggest mode" · a simple analytics view (answered / skipped).

---

## 15. Mini-glossary for newcomers

- **Frontend / backend** — the part you see (frontend) vs. the engine behind it (backend).
- **API** — the set of "doors" the website knocks on to ask the server to do things.
- **OTP** — the one-time 6-digit code emailed to verify you.
- **Session / cookie** — the "logged-in wristband" your browser carries.
- **OAuth** — the "Sign in with Google/Slack" click-to-authorize flow.
- **Tool (for the AI)** — a specific action the AI is allowed to take (read messages, prepare a send, etc.).
- **Credit** — one unit of AI usage; plans include a monthly bucket.
- **Webhook** — Stripe phoning us to say "this payment happened."
- **node-cron** — a built-in timer that runs code on a schedule.

---

*RelayFlow — by Levi app.*
