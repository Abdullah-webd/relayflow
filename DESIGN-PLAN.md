# RelayFlow landing redesign: design plan

**Subject / audience / job:** RelayFlow, one AI agent over WhatsApp, Telegram and Slack, for owners and operators of businesses that run on chat (Lagos retail, wholesale and service teams, plus global support/sales teams). The page's job is to get them to start the free trial.

**Dial:** 7. Landing is the marketing surface; app screens stay at dial 4 (separate work).

**Brand constraints (from the project's CLAUDE.md, these win):** white page backgrounds; brand blue #0566E0 for buttons, #0573FE logo blue; existing logo assets.

## Palette
| Role | Hex | Use |
|---|---|---|
| Ground | #FFFFFF | Every page background (rule) |
| Relay navy | #071D40 | Display type and ink. It's the logo's navy, not a generic near-black |
| Brand blue | #0566E0 | Buttons, links, active states |
| Signal blue | #0573FE | Moving "relay" elements: packets, wires, the approved message |
| Wire | #DCE7F7 | Hairlines, tracks, inactive wires |
| Ping amber | #F5A524 | "Needs you" only, at most 2–3 uses on the page |

Channel colours (WhatsApp green, Telegram blue, Slack aubergine) appear only inside their own marks.

## Type
- **Display: Funnel Display** (600/700). A grotesk with tight, slightly soft letterforms, not one of the default SaaS faces. Hero headline is set at about 9.5vw, left-aligned, broken into deliberate lines.
- **Text: Funnel Sans**, the same family's text cut, for body, UI fragments and buttons.
- **Mono:** JetBrains Mono, used only for genuine agent log lines ("Read 27 messages across 4 channels").

## Layout and signature
**Signature: the relay.** Many chats come in, you approve once, and one reply goes back out to every channel.

```
HERO (pinned, scrubbed)
  [Every business chat,            ]   chat bubbles from WhatsApp/Telegram/Slack
  [answered from one place.        ]   drift around the headline (real messages:
  [sub · CTA · trial note          ]   Chidi, Priya, Lekki customers)
  ───── scroll ─────
  bubbles get pulled into the product window, which grows from an inset card
  to full width → "Read 27 messages across 4 channels"

CHAOS → CLARITY (pinned scene)
  left: "Know what happened without reading every chat."
  right: a wall of 27 overlapping messages scrubs and collapses into
         the answer: Needs you · 2  /  For your information · 3

CAPABILITIES (sticky card stack, 5 large cards)
  approve before send → send everywhere → schedules → monitors → auto-replies
  each card's UI fragment plays its own micro-story when it lands

IMAGE BAND (Higgsfield photo, scales from keyhole to full-bleed)
  "Run the shop. RelayFlow watches the chats."

HOW IT WORKS (real 3-step sequence, so numbering is legitimate)
  a relay wire draws across as you scroll; a signal packet travels and lights each step

SECURITY
  manifesto paragraph with words lighting up as you scroll (scrubbed),
  then the 4 guarantees, each drawing in its own hairline

CUSTOMERS: typographic statements (no count-up), masked line reveals
PRICING: two plans, features tick in, tactile buttons
FAQ: animated accordion (height + chevron)
FINAL CTA: "Put one agent on every chat." The three channel marks orbit, then converge into the logo mark
```

## Motion thesis
"Messages are relayed: they arrive from the edges, converge into one place, wait for your approval, then go back out along the wire."
- **Focal sequence (≤ 1.4s):** headline lines rise inside masks, then chat bubbles slide in from three edges with slightly different timing per channel, then the CTA settles. Nav and CTA are usable from the first frame.
- **Set-pieces:**
  - the hero converge + zoom (§5 + custom)
  - chaos → clarity pinned scrub (§6)
  - the capability card stack (§8)
  - the keyhole image (§5 variant)
  - the relay-wire draw (§15)
  - the manifesto word reveal (§9)
- **Route transitions:** View Transitions (document.startViewTransition) on landing → signup/login/pricing CTAs.
- **Feedback:**
  - Buttons press to 0.97; primary CTAs roll their label on hover.
  - Links get a sliding underline.
  - The header hides when scrolling down and returns when scrolling up.
  - The mobile menu animates in and out with Motion presence.
  - FAQ panels animate their height.
- **Reduced motion:** final states throughout, with no pin, no scrub and no smooth scroll.

## Generic-default check (what changed and why)
- **Removed the pill badge above the H1** ("New · Monitors that email you"). It's a classic template tell, and the monitors feature gets its own card instead.
- **Removed the logo-row strip** ("Works with WhatsApp / Telegram / Slack"). The channels now live inside the hero's converging bubbles, which shows the integration instead of listing it.
- **Replaced the bento grid of identical tiles** with a sticky card stack, where each capability gets the full stage and its own micro-story.
- **Customer results stay, because they're real.** They're presented as typographic statements, not as the generic big-number cards.
- **Kept the 01/02/03 numbering** because the steps really are a sequence.
- **Changed the font:** Inter is replaced by Funnel Display/Sans. Inter is the most common AI default.
- **Swapped the hero's dot-grid texture** for the moving bubbles. Decorative grid backgrounds are a tell, and motion carries the hero now.
