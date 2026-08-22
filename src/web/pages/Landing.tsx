import { useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import {
  MessageSquare,
  Send,
  Plug,
  Clock,
  ShieldCheck,
  Sparkles,
  Radar,
  Layers,
  Lock,
  Check,
  Menu,
  X,
  ArrowRight,
  ChevronDown,
} from "lucide-react";

const channels = [
  { name: "WhatsApp", color: "#25D366" },
  { name: "Telegram", color: "#229ED9" },
  { name: "Slack", color: "#611f69" },
  { name: "Gmail", color: "#EA4335" },
];

const navLinks = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const steps = [
  {
    icon: Plug,
    title: "Connect your channels",
    body: "Scan a WhatsApp QR, sign in to Telegram, or authorize Slack & Gmail with official OAuth. You always see what's connected and what dropped.",
  },
  {
    icon: MessageSquare,
    title: "Ask anything",
    body: "\"What did people say on Telegram today?\" RelayFlow reads recent messages and answers in seconds — summaries without the scrolling.",
  },
  {
    icon: Send,
    title: "Act with one approval",
    body: "Draft a reply to one group or a broadcast to every channel at once. RelayFlow writes it, you approve, it delivers.",
  },
];

const features = [
  {
    icon: Radar,
    title: "360° channel awareness",
    body: "The agent knows every connected channel — and tells you the moment one disconnects, so nothing slips through.",
  },
  {
    icon: Layers,
    title: "Send to all channels at once",
    body: "Post one message to a single group or broadcast to WhatsApp, Telegram, Slack, and Gmail together — from one prompt.",
  },
  {
    icon: ShieldCheck,
    title: "Approve before send",
    body: "Nothing goes out without your explicit approval. When the agent is unsure, it asks instead of guessing.",
  },
  {
    icon: Clock,
    title: "Scheduled tasks in plain English",
    body: "\"Every morning at 9, send a good-morning to WhatsApp.\" Describe it once and RelayFlow runs it on time.",
  },
  {
    icon: MessageSquare,
    title: "Multi-session chat",
    body: "Run several conversations ChatGPT-style, each with its own context — one for support, one for ops, one for outreach.",
  },
  {
    icon: Lock,
    title: "Secure by design",
    body: "Field-level encryption and official OAuth for Slack & Gmail. Your credentials and messages stay protected.",
  },
];

// Real customers from the original RelayFlow site.
type Customer = { name: string; href?: string; logo?: string; wordmark?: boolean; context: string; result: string; outcome: string };
const customers: Customer[] = [
  {
    name: "Graph",
    href: "https://graph.finance",
    logo: "/graph-logo.jpg",
    context: "Global payments · Techstars ’23",
    result: "30×",
    outcome: "reported increase in productivity and revenue",
  },
  {
    name: "ScalePad",
    // No href — ScalePad doesn't have a public site yet, so this card is not clickable.
    wordmark: true,
    context: "The MSP operating platform",
    result: "20×",
    outcome: "reported increase in outreach and productivity",
  },
];

const pricing = [
  {
    name: "Starter",
    price: "10",
    tagline: "For individuals & small teams.",
    popular: false,
    features: [
      "500 AI credits / month",
      "All 4 channels — WhatsApp, Telegram, Slack, Gmail",
      "Approve-before-send on every action",
      "Scheduled tasks in plain English",
      "Multi-session chat",
    ],
  },
  {
    name: "Growth",
    price: "30",
    tagline: "For busy teams & agencies.",
    popular: true,
    features: [
      "2,000 AI credits / month",
      "Everything in Starter",
      "Priority processing",
      "All 4 channels & broadcast to all",
      "Multi-session chat",
    ],
  },
];

const faqs = [
  {
    q: "Is RelayFlow secure?",
    a: "Yes. We use field-level encryption for sensitive data and official OAuth for Slack and Gmail. Every send requires your explicit approval, so the agent never acts on its own.",
  },
  {
    q: "Does it store my whole message history?",
    a: "No. RelayFlow only keeps lightweight recent context so it can answer questions and summarize — it does not archive your entire history across channels.",
  },
  {
    q: "Can it send to all my channels at once?",
    a: "Absolutely. Ask RelayFlow to message one specific group or broadcast to every connected channel at the same time. You approve the draft before anything is delivered.",
  },
  {
    q: "What are AI credits?",
    a: "A credit is one AI agent action — a summary, an answer, a drafted message, or a send. Starter includes 500 credits/month and Growth includes 2,000.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Both plans start with a 1-day free trial (card required), and you can cancel whenever you like — no long-term contract.",
  },
  {
    q: "Which channels can I connect?",
    a: "WhatsApp, Telegram, Slack, and Gmail. RelayFlow gives you 360° awareness of all four from a single chat.",
  },
];

const marqueeCss = `
@keyframes rf-marquee-left { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes rf-marquee-right { from { transform: translateX(-50%); } to { transform: translateX(0); } }
.rf-marquee-track { display: flex; width: max-content; gap: 1rem; }
.rf-row-left { animation: rf-marquee-left 46s linear infinite; }
.rf-row-right { animation: rf-marquee-right 52s linear infinite; }
.rf-marquee-group:hover .rf-marquee-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  .rf-row-left, .rf-row-right { animation: none; }
}
`;

function CustomerCard({ c }: { c: Customer }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-line min-h-[52px]">
        {c.wordmark ? (
          <span className="text-[26px] font-extrabold tracking-tight text-ink-900">
            Scale<span className="text-brand-600">Pad</span>
          </span>
        ) : (
          <img src={c.logo} alt={c.name} className="h-8 w-auto object-contain" />
        )}
        <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400 text-right max-w-[150px] leading-tight">
          {c.context}
        </span>
      </div>
      <div className="mt-5 flex items-center gap-4">
        <span className="text-5xl font-extrabold tracking-tight text-brand-600 leading-none">{c.result}</span>
        <span className="text-[15px] text-ink-600 leading-snug max-w-[230px]">{c.outcome}</span>
      </div>
      <small className="mt-auto pt-4 text-[11px] uppercase tracking-wide font-bold text-ink-400">Customer-reported outcome</small>
    </>
  );
  const base = "card p-6 sm:p-7 w-[340px] sm:w-[440px] shrink-0 flex flex-col";
  // Only cards with a real site are clickable; others render as a plain (non-link) card.
  return c.href ? (
    <a href={c.href} target="_blank" rel="noopener noreferrer" className={`${base} hover:-translate-y-1 hover:shadow-pop transition`}>
      {inner}
    </a>
  ) : (
    <div className={base}>{inner}</div>
  );
}

function CustomerMarquee() {
  // Duplicate the small real set enough times to fill a seamless scrolling loop.
  const loop = [...customers, ...customers, ...customers, ...customers];
  return (
    <div className="rf-marquee-group overflow-hidden py-2">
      <div className="rf-marquee-track rf-row-left">
        {loop.map((c, i) => (
          <CustomerCard key={`${c.name}-${i}`} c={c} />
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-full bg-white text-ink-800 overflow-x-hidden">
      <style>{marqueeCss}</style>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-line">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" aria-label="RelayFlow home" className="shrink-0">
            <Logo byline />
          </Link>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-[15px] font-medium text-ink-600 hover:text-ink-900 px-3 py-2 rounded-lg transition"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <Link
              to="/login"
              className="text-[15px] font-semibold text-ink-700 hover:text-ink-900 px-3 py-2"
            >
              Sign in
            </Link>
            <Link to="/signup" className="btn-primary h-10 px-4">
              Get started
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="md:hidden grid place-items-center h-11 w-11 -mr-1 rounded-xl text-ink-700 hover:bg-surface transition"
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="md:hidden border-t border-line bg-white">
            <nav aria-label="Mobile" className="mx-auto max-w-6xl px-5 py-4 flex flex-col gap-1">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="text-base font-medium text-ink-700 hover:bg-surface rounded-xl px-3 py-3"
                >
                  {l.label}
                </a>
              ))}
              <div className="h-px bg-line my-2" />
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="btn-ghost h-12 w-full"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                onClick={() => setMenuOpen(false)}
                className="btn-primary h-12 w-full"
              >
                Get started
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 55% at 80% 0%, rgba(79,70,229,.08), transparent 60%), radial-gradient(45% 45% at 5% 10%, rgba(34,193,214,.08), transparent 60%)",
            }}
          />
          <div className="mx-auto max-w-6xl px-5 sm:px-6 pt-16 sm:pt-24 pb-16 grid lg:grid-cols-2 gap-12 lg:gap-14 items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold px-3 py-1.5">
                <Sparkles size={15} /> One agent. Every channel.
              </span>
              <h1 className="mt-5 text-[38px] sm:text-[52px] lg:text-[56px] leading-[1.04] font-extrabold tracking-tight text-ink-900">
                One AI agent across{" "}
                <span className="text-brand-600">every business chat.</span>
              </h1>
              <p className="mt-5 text-[17px] sm:text-lg leading-relaxed text-ink-600 max-w-xl">
                Connect WhatsApp, Telegram, Slack, and Gmail — then just talk to
                RelayFlow. Ask what's been said, summarize any channel, and send one
                message everywhere. It always asks before it sends.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to="/signup" className="btn-primary h-12 px-6 text-base">
                  Start free trial <ArrowRight size={18} />
                </Link>
                <Link to="/login" className="btn-ghost h-12 px-6 text-base">
                  Sign in
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-500">
                {channels.map((c) => (
                  <span key={c.name} className="inline-flex items-center gap-2 font-medium">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: c.color }}
                    />
                    {c.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Product mock */}
            <div className="relative">
              <div className="card p-5 shadow-pop">
                <div className="flex items-center gap-2 pb-3 border-b border-line">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  <span className="ml-2 text-sm font-semibold text-ink-500">
                    RelayFlow · Chat
                  </span>
                </div>
                <div className="pt-4 space-y-3">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-brand-50 text-brand-800 px-4 py-2.5 text-[15px]">
                    Summarize what's been discussed on WhatsApp today, then send a
                    thank-you to all channels.
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span
                      className="grid place-items-center h-8 w-8 rounded-lg text-white shrink-0"
                      style={{ background: "linear-gradient(135deg,#22c1d6,#4f46e5)" }}
                    >
                      <Sparkles size={16} />
                    </span>
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 text-[15px] text-ink-700">
                      <p className="text-ink-900 font-semibold mb-1">
                        Here's today on WhatsApp
                      </p>
                      3 customers asked about delivery times; 1 reported a delayed
                      order. I've drafted a thank-you —
                      <span className="text-brand-700 font-medium">
                        {" "}
                        review & approve to send to all 4 channels.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-3 sm:-left-4 card px-4 py-3 flex items-center gap-3 bg-white">
                <ShieldCheck size={20} className="text-emerald-600 shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold text-ink-900">Approve before send</div>
                  <div className="text-ink-500">Nothing goes out without you.</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stat band */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 sm:px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {[
              { stat: "4", label: "Channels, one agent" },
              { stat: "1 chat", label: "For every conversation" },
              { stat: "0", label: "Sends without approval" },
              { stat: "24/7", label: "Scheduled tasks that just run" },
            ].map((s) => (
              <div key={s.label} className="text-center sm:text-left">
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">
                  {s.stat}
                </div>
                <div className="mt-1 text-sm text-ink-500">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-5 sm:px-6 py-16 sm:py-20">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink-900">
              How it works
            </h2>
            <p className="mt-3 text-[15px] sm:text-lg text-ink-600 leading-relaxed">
              From scattered chats to one calm command line — in three steps.
            </p>
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {steps.map((s, i) => (
              <div key={s.title} className="card p-6">
                <div className="flex items-center justify-between">
                  <span className="grid place-items-center h-11 w-11 rounded-xl bg-brand-50 text-brand-600">
                    <s.icon size={20} />
                  </span>
                  <span className="text-sm font-bold text-ink-400">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-ink-900">{s.title}</h3>
                <p className="mt-2 text-[15px] text-ink-600 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-surface border-y border-line">
          <div className="mx-auto max-w-6xl px-5 sm:px-6 py-16 sm:py-20">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink-900">
                Everything you need to run every chat
              </h2>
              <p className="mt-3 text-[15px] sm:text-lg text-ink-600 leading-relaxed">
                One agent that reads, answers, drafts, sends, and schedules — safely.
              </p>
            </div>
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f) => (
                <div key={f.title} className="card p-6">
                  <span className="grid place-items-center h-11 w-11 rounded-xl bg-brand-50 text-brand-600">
                    <f.icon size={20} />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-ink-900">{f.title}</h3>
                  <p className="mt-2 text-[15px] text-ink-600 leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trusted by — real customer outcomes */}
        <section className="py-16 sm:py-20 overflow-hidden">
          <div className="mx-auto max-w-6xl px-5 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <div className="text-sm font-bold uppercase tracking-wide text-brand-600">Trusted by</div>
                <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-ink-900">
                  Teams moving faster with RelayFlow.
                </h2>
              </div>
              <p className="text-[15px] sm:text-base text-ink-600 leading-relaxed max-w-sm">
                Real operators turning conversations into measurable momentum.
              </p>
            </div>
          </div>
          <div className="mt-12">
            <CustomerMarquee />
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="bg-surface border-y border-line">
          <div className="mx-auto max-w-6xl px-5 sm:px-6 py-16 sm:py-20">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink-900">
                Simple, credit-based pricing
              </h2>
              <p className="mt-3 text-[15px] sm:text-lg text-ink-600 leading-relaxed">
                A credit is one AI agent action. Every plan starts with a 1-day free
                trial (card required).
              </p>
            </div>
            <div className="mt-12 grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {pricing.map((p) => (
                <div
                  key={p.name}
                  className={`relative card p-7 sm:p-8 flex flex-col ${
                    p.popular ? "ring-2 ring-brand-600 shadow-pop" : ""
                  }`}
                >
                  {p.popular && (
                    <span className="absolute -top-3 right-6 inline-flex items-center gap-1 rounded-full bg-brand-600 text-white text-xs font-bold px-3 py-1">
                      <Sparkles size={13} /> Most popular
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-ink-900">{p.name}</h3>
                  <p className="mt-1 text-sm text-ink-500">{p.tagline}</p>
                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-ink-900">
                      ${p.price}
                    </span>
                    <span className="text-ink-500 text-[15px] font-medium">/month</span>
                  </div>
                  <ul className="mt-6 space-y-3 flex-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[15px] text-ink-700">
                        <span className="grid place-items-center h-5 w-5 rounded-full bg-brand-50 text-brand-600 shrink-0 mt-0.5">
                          <Check size={13} strokeWidth={3} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/signup"
                    className={`mt-7 h-12 px-6 text-base w-full ${
                      p.popular ? "btn-primary" : "btn-ghost"
                    }`}
                  >
                    Start 1-day free trial
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-6 text-center text-sm text-ink-500">
              Cancel anytime. No long-term contracts.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-5 sm:px-6 py-16 sm:py-20">
          <div className="text-center">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink-900">
              Frequently asked questions
            </h2>
          </div>
          <div className="mt-10 divide-y divide-line border-y border-line">
            {faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-4 py-5 text-left"
                  >
                    <span className="text-[16px] sm:text-lg font-semibold text-ink-900">
                      {f.q}
                    </span>
                    <ChevronDown
                      size={20}
                      className={`shrink-0 text-ink-400 transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {open && (
                    <p className="pb-5 -mt-1 text-[15px] text-ink-600 leading-relaxed">
                      {f.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-5 sm:px-6 pb-20">
          <div className="relative overflow-hidden rounded-3xl bg-ink-900 text-white px-6 sm:px-10 py-14 sm:py-16 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(50% 60% at 50% 0%, rgba(79,70,229,.45), transparent 70%), radial-gradient(40% 50% at 85% 100%, rgba(34,193,214,.28), transparent 70%)",
              }}
            />
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Put one agent across all your chats.
              </h2>
              <p className="mt-3 text-white/70 text-[15px] sm:text-lg">
                Connect your first channel in under a minute. Start your 1-day free trial.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/signup"
                  className="btn-primary h-12 px-7 text-base bg-white text-ink-900 hover:bg-white/90 shadow-none"
                >
                  Get started free <ArrowRight size={18} />
                </Link>
                <Link
                  to="/login"
                  className="btn-ghost h-12 px-7 text-base border-white/20 text-white hover:bg-white/10"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 sm:px-6 py-12">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <Logo byline />
              <p className="mt-4 text-[15px] text-ink-500 leading-relaxed max-w-xs">
                One AI agent across every business chat — WhatsApp, Telegram, Slack,
                and Gmail.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-ink-900 uppercase tracking-wide">
                Product
              </h3>
              <ul className="mt-4 space-y-2.5 text-[15px] text-ink-600">
                <li><a href="#features" className="hover:text-ink-900">Features</a></li>
                <li><a href="#how" className="hover:text-ink-900">How it works</a></li>
                <li><a href="#pricing" className="hover:text-ink-900">Pricing</a></li>
                <li><Link to="/signup" className="hover:text-ink-900">Get started</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-bold text-ink-900 uppercase tracking-wide">
                Company
              </h3>
              <ul className="mt-4 space-y-2.5 text-[15px] text-ink-600">
                <li><a href="#" className="hover:text-ink-900">About</a></li>
                <li><a href="#" className="hover:text-ink-900">Blog</a></li>
                <li><a href="#" className="hover:text-ink-900">Careers</a></li>
                <li><a href="#" className="hover:text-ink-900">Contact</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-bold text-ink-900 uppercase tracking-wide">
                Legal
              </h3>
              <ul className="mt-4 space-y-2.5 text-[15px] text-ink-600">
                <li><a href="#" className="hover:text-ink-900">Privacy</a></li>
                <li><a href="#" className="hover:text-ink-900">Terms</a></li>
                <li><a href="#" className="hover:text-ink-900">Security</a></li>
                <li><a href="#" className="hover:text-ink-900">DPA</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-ink-500">
            <span>© {new Date().getFullYear()} RelayFlow. All rights reserved.</span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={15} className="text-emerald-600" />
              Field-level encryption · Official OAuth
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
