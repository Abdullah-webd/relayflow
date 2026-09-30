import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { Reveal } from "../components/Reveal";
import { ChannelMark, CHANNEL_COLOR, CHANNEL_NAME, type Channel } from "../components/ChannelMark";
import { useAuth } from "../lib/auth";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  KeyRound,
  Lock,
  Mail,
  Menu,
  QrCode,
  Radar,
  ShieldCheck,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const CHANNELS: Channel[] = ["whatsapp", "telegram", "slack", "gmail"];

const navLinks = [
  { label: "Product", href: "#product" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

// Real customers from the original RelayFlow site (customer-reported outcomes).
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
    wordmark: true,
    context: "The MSP operating platform",
    result: "20×",
    outcome: "reported increase in outreach and productivity",
  },
];

const planFeatures = [
  "Unlimited AI actions, no usage credits",
  "WhatsApp, Telegram, Slack and Gmail",
  "Approve-before-send on every message",
  "Scheduled tasks and monitors",
  "Auto-replies from your knowledge base",
  "Unlimited chat sessions",
];

const faqs = [
  {
    q: "Is RelayFlow secure?",
    a: "Yes. Sensitive credentials are encrypted at the field level, and Slack and Gmail connect through their official OAuth sign-in. Anything the agent sends for you waits for your approval, and auto-replies only run on the channels you turn them on for.",
  },
  {
    q: "Does it store my whole message history?",
    a: "No. RelayFlow keeps only recent context (about the last week) so it can answer questions and summarize. It doesn't archive your full history.",
  },
  {
    q: "Can it send to all my channels at once?",
    a: "Yes. Ask it to message one specific group or every connected channel at the same time. You see the exact message and destinations, and approve before anything is delivered.",
  },
  {
    q: "How much does it cost?",
    a: "One plan at $15 a month with everything included: unlimited AI actions, all four channels, scheduled tasks and monitors. Try it free for 1 day first. No credit card required.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. The free trial needs no card, so there's nothing to cancel if you decide it isn't for you. If you subscribe, cancel from Settings whenever you like. No contracts.",
  },
  {
    q: "Which channels can I connect?",
    a: "WhatsApp, Telegram, Slack and Gmail. You can connect one or all four, and see at a glance which are live.",
  },
];

const i = (n: number) => ({ "--i": n }) as CSSProperties;

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-container px-5 sm:px-6 ${className}`}>{children}</div>;
}

function SectionHeading({ title, body, className = "" }: { title: string; body?: string; className?: string }) {
  return (
    <div className={`max-w-2xl ${className}`}>
      <h2 className="text-display-sm sm:text-display-md font-semibold text-ink-900">{title}</h2>
      {body && <p className="mt-4 text-lead text-ink-600">{body}</p>}
    </div>
  );
}

function ChannelDot({ channel, size = 14 }: { channel: Channel; size?: number }) {
  return <ChannelMark channel={channel} size={size} className="shrink-0" title={CHANNEL_NAME[channel]} />;
}

function AgentAvatar() {
  return (
    <span className="shrink-0 mt-0.5">
      <Logo size={24} showText={false} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hero product window (the page's signature moment)
// ---------------------------------------------------------------------------

const inbox: { channel: Channel; name: string; unread: number; active?: boolean }[] = [
  { channel: "whatsapp", name: "Lekki Store Customers", unread: 12, active: true },
  { channel: "whatsapp", name: "Wholesale Buyers", unread: 3 },
  { channel: "telegram", name: "Dev Syndicate", unread: 5 },
  { channel: "slack", name: "#support", unread: 2 },
  { channel: "gmail", name: "Inbox", unread: 7 },
];

function ApprovalCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white shadow-card">
      <div className="flex items-center justify-between px-4 h-11 border-b border-line">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-900">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Ready to send
        </span>
        <span className="text-[12px] text-ink-500">Needs your approval</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(compact ? (["whatsapp", "slack"] as Channel[]) : (["whatsapp", "whatsapp", "slack"] as Channel[])).map((c, n) => (
            <span key={n} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 h-6 text-[12px] text-ink-700">
              <ChannelMark channel={c} size={11} className="text-ink-500" />
              {c === "slack" ? "#support" : n === 0 ? "Lekki Store Customers" : "Wholesale Buyers"}
            </span>
          ))}
        </div>
        <p className="rounded-lg bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink-700">
          Hi everyone, deliveries to Lekki and Victoria Island leave daily at 2pm and arrive the next morning. Order #4821 ships today. Thanks for your patience.
        </p>
        <div className="flex gap-2">
          <span className="btn-primary h-8 px-3 text-[13px] flex-1">Approve and send</span>
          <span className="btn-ghost h-8 px-3 text-[13px]">Edit</span>
        </div>
      </div>
    </div>
  );
}

function ProductWindow() {
  return (
    <div className="relative rf-frame-in">
      <div className="relative overflow-hidden rounded-3xl bg-white shadow-frame">
        {/* Title bar */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-line">
          <div className="flex items-center gap-2.5 text-[13px]">
            <Logo size={20} showText={false} />
            <span className="font-medium text-ink-900">RelayFlow</span>
            <span className="hidden sm:inline text-ink-300">/</span>
            <span className="hidden sm:inline text-ink-500">Morning check-in</span>
          </div>
          <span className="inline-flex items-center gap-2 text-[12px] text-ink-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-accent-500/40 motion-safe:animate-ping [animation-duration:2.4s]" />
              <span className="relative h-2 w-2 rounded-full bg-accent-500" />
            </span>
            <span className="sm:hidden">4 live</span>
            <span className="hidden sm:inline">4 channels connected</span>
          </span>
        </div>

        <div className="grid md:grid-cols-[232px_1fr] lg:grid-cols-[232px_1fr_320px] min-h-[420px]">
          {/* Channels */}
          <aside className="hidden md:block border-r border-line bg-surface/50 p-3">
            <div className="px-2 pb-2 text-[12px] font-medium text-ink-500">Channels</div>
            <ul className="space-y-0.5">
              {inbox.map((row) => (
                <li
                  key={row.name}
                  className={`flex items-center gap-2.5 rounded-lg px-2 h-9 text-[13px] ${row.active ? "bg-white shadow-xs text-ink-900" : "text-ink-600"}`}
                >
                  <ChannelMark channel={row.channel} size={14} className="shrink-0" />
                  <span className="truncate flex-1">{row.name}</span>
                  <span className="font-mono text-[11px] tabular-nums text-ink-500">{row.unread}</span>
                </li>
              ))}
            </ul>
          </aside>

          {/* Conversation */}
          <div className="p-4 sm:p-6 space-y-4">
            <div className="rf-msg flex justify-end" style={i(0)}>
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 text-white px-4 py-2.5 text-[14px] leading-relaxed">
                What did customers ask about today? Draft a reply to the delivery questions.
              </div>
            </div>

            <div className="rf-msg flex items-center gap-2 pl-9 font-mono text-[11px] text-ink-500" style={i(1)}>
              <CircleCheck size={13} className="text-brand-600" />
              Read 27 messages across 4 channels
            </div>

            <div className="rf-msg flex items-start gap-3" style={i(2)}>
              <AgentAvatar />
              <div className="min-w-0 flex-1 text-[14px] leading-relaxed text-ink-700">
                <p className="text-ink-900 font-medium">Here’s today across your channels:</p>
                <ul className="mt-2 space-y-2">
                  <li className="flex gap-2">
                    <ChannelDot channel="whatsapp" />
                    <span>
                      <b className="font-medium text-ink-900">Lekki Store Customers:</b> 6 people asked when deliveries to Lekki arrive. Order #4821 is a day late.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ChannelDot channel="slack" />
                    <span>
                      <b className="font-medium text-ink-900">#support:</b> Daniel Ruiz is waiting on a refund, open since 10:14.
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <ChannelDot channel="telegram" />
                    <span>
                      <b className="font-medium text-ink-900">Dev Syndicate:</b> Amara shared the v2.3 release notes. Nothing needs you.
                    </span>
                  </li>
                </ul>
                <p className="mt-3">I drafted a reply for the delivery questions. Review it before it goes out.</p>
              </div>
            </div>

            <div className="rf-msg lg:hidden pl-9" style={i(3)}>
              <ApprovalCard compact />
            </div>
          </div>

          {/* Approval */}
          <div className="hidden lg:block border-l border-line bg-surface/50 p-4">
            <div className="rf-msg" style={i(3)}>
              <ApprovalCard />
            </div>
            <div className="rf-msg mt-3 flex items-center gap-2 px-1 text-[12px] text-ink-500" style={i(4)}>
              <ShieldCheck size={14} className="text-ink-400" />
              Nothing is sent until you approve.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feature visuals (real UI fragments)
// ---------------------------------------------------------------------------

function AnswerVisual() {
  return (
    <div className="rounded-3xl border border-line bg-white shadow-md overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center gap-3">
        <span className="text-[14px] text-ink-900 font-medium">Anything urgent in the last 24 hours?</span>
      </div>
      <div className="p-5 space-y-5 text-[14px]">
        <div>
          <div className="text-[12px] font-medium text-ink-500 mb-2">Needs you · 2</div>
          <div className="space-y-2">
            {[
              { c: "gmail" as Channel, who: "Priya Nair", what: "Asked to reschedule Thursday’s supplier call to Friday.", when: "2h ago" },
              { c: "whatsapp" as Channel, who: "Chidi Okafor", what: "Wants a quote for 50 cartons before 5pm.", when: "35m ago" },
            ].map((r) => (
              <div key={r.who} className="flex items-start gap-3 rounded-xl border border-line px-3.5 py-3">
                <ChannelMark channel={r.c} size={16} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink-900">{r.who}</span>
                    <span className="text-[12px] text-ink-500 tabular-nums">{r.when}</span>
                  </div>
                  <p className="text-ink-600">{r.what}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[12px] font-medium text-ink-500 mb-2">For your information · 3</div>
          <ul className="space-y-1.5 text-ink-600">
            <li className="flex gap-2"><ChannelMark channel="telegram" size={14} className="mt-1 text-ink-400" />Dev Syndicate agreed to ship v2.3 on Monday.</li>
            <li className="flex gap-2"><ChannelMark channel="slack" size={14} className="mt-1 text-ink-400" />#support closed 14 tickets, 2 still open.</li>
            <li className="flex gap-2"><ChannelMark channel="whatsapp" size={14} className="mt-1 text-ink-400" />Wholesale Buyers shared the new price list.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Tile({ title, body, children, className = "" }: { title: string; body: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-2xl border border-line bg-white overflow-hidden ${className}`}>
      <div className="flex-1 min-h-0 flex flex-col justify-center border-b border-line bg-surface/60 p-5 sm:p-6">{children}</div>
      <div className="p-5 sm:p-6">
        <h3 className="text-[16px] font-medium text-ink-900 tracking-[-0.01em]">{title}</h3>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-600">{body}</p>
      </div>
    </div>
  );
}

function MiniCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-white shadow-xs ${className}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const { user, loading } = useAuth();
  const loggedIn = !!user && !loading; // already signed in → send them to the dashboard

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const primaryCta = loggedIn ? (
    <Link to="/app" className="btn-primary h-11 px-5 text-[15px]">
      Go to dashboard <ArrowRight size={16} />
    </Link>
  ) : (
    <Link to="/signup" className="btn-primary h-11 px-5 text-[15px]">
      Start free trial
    </Link>
  );

  return (
    <div className="min-h-full bg-white text-ink-800 overflow-x-clip">
      {/* Header */}
      <header
        className={`sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b transition-[border-color] duration-200 ${scrolled || menuOpen ? "border-line" : "border-transparent"}`}
      >
        <Container className="h-16 flex items-center justify-between">
          <Link to="/" aria-label="RelayFlow home" className="shrink-0">
            <Logo byline />
          </Link>

          <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="text-[14px] text-ink-600 hover:text-ink-900 px-3 py-2 rounded-lg transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            {loggedIn ? (
              <Link to="/app" className="btn-primary h-9 px-4">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-[14px] font-medium text-ink-700 hover:text-ink-900 px-3 py-2 transition-colors">
                  Sign in
                </Link>
                <Link to="/signup" className="btn-primary h-9 px-4">
                  Start free trial
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="md:hidden grid place-items-center h-11 w-11 -mr-2 rounded-lg text-ink-700 hover:bg-surface transition-colors"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </Container>

        {menuOpen && (
          <div id="mobile-menu" className="md:hidden bg-white">
            <nav aria-label="Mobile" className="px-5 pb-5 pt-2 flex flex-col gap-1">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="text-[16px] text-ink-700 hover:bg-surface rounded-lg px-3 py-3"
                >
                  {l.label}
                </a>
              ))}
              <div className="h-px bg-line my-2" />
              {loggedIn ? (
                <Link to="/app" onClick={() => setMenuOpen(false)} className="btn-primary h-12 w-full text-[15px]">
                  Go to dashboard
                </Link>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" onClick={() => setMenuOpen(false)} className="btn-ghost h-12 text-[15px]">
                    Sign in
                  </Link>
                  <Link to="/signup" onClick={() => setMenuOpen(false)} className="btn-primary h-12 text-[15px]">
                    Start free trial
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* ---------------- Hero ---------------- */}
        <section id="product" className="relative pt-16 sm:pt-24 pb-20 sm:pb-28">
          {/* One texture on the page: a faint dot grid behind the hero, fading out. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[720px] -z-10"
            style={{
              backgroundImage: "radial-gradient(rgb(var(--ink-400) / 0.35) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              maskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%)",
            }}
          />
          <Container>
            <div className="max-w-[1040px]">
              <a
                href="#features"
                className="rf-in group inline-flex items-center gap-2 rounded-full border border-line bg-white pl-1 pr-3 h-8 text-[13px] text-ink-600 shadow-xs hover:border-line-strong transition-colors"
                style={i(0)}
              >
                <span className="rounded-full bg-brand-50 text-brand-700 px-2 h-6 inline-flex items-center font-medium">New</span>
                Monitors that email you
                <ArrowRight size={13} className="text-ink-400 transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>

              <h1 className="rf-in mt-6 text-[40px] leading-[1.05] tracking-[-0.03em] sm:text-display-lg lg:text-display-xl font-semibold text-ink-900" style={i(1)}>
                Every business chat, answered from one place.
              </h1>

              <p className="rf-in mt-6 text-[17px] sm:text-lead text-ink-600 max-w-[54ch]" style={i(2)}>
                RelayFlow reads your WhatsApp, Telegram, Slack and Gmail, tells you what needs attention, and drafts replies you approve before anything is sent.
              </p>

              <div className="rf-in mt-8 flex flex-col sm:flex-row sm:items-center gap-3" style={i(3)}>
                {primaryCta}
                {!loggedIn && (
                  <a href="#how" className="btn-ghost h-11 px-5 text-[15px]">
                    See how it works
                  </a>
                )}
              </div>
              {!loggedIn && (
                <p className="rf-in mt-4 text-[13px] text-ink-500" style={i(4)}>
                  1-day free trial · No credit card required
                </p>
              )}
            </div>

            <div className="mt-14 sm:mt-16">
              <ProductWindow />
            </div>
          </Container>
        </section>

        {/* ---------------- Works with ---------------- */}
        <section aria-label="Supported channels" className="border-y border-line">
          <Container className="py-8 flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
            <p className="text-[14px] text-ink-500 md:max-w-[220px] shrink-0">Works with the channels your customers already use</p>
            <ul className="grid grid-cols-2 sm:flex sm:flex-1 sm:justify-between gap-6 text-ink-400">
              {CHANNELS.map((c) => (
                <li key={c} className="inline-flex items-center gap-2.5 text-[17px] font-medium tracking-[-0.01em] text-ink-500">
                  <ChannelMark channel={c} size={20} />
                  {CHANNEL_NAME[c]}
                </li>
              ))}
            </ul>
          </Container>
        </section>

        {/* ---------------- Answers (split) ---------------- */}
        <section className="py-24 sm:py-32">
          <Container className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <Reveal className="lg:col-span-5">
              <SectionHeading
                title="Know what happened without reading every chat."
                body="Ask in plain English. RelayFlow reads the recent messages in every connected group, channel and inbox, then answers with the parts that need you."
              />
              <ul className="mt-8 space-y-2">
                {["What did the wholesale buyers ask this week?", "Anything urgent in #support?", "Summarize Dev Syndicate since Monday"].map((q) => (
                  <li key={q} className="flex items-center gap-3 text-[15px] text-ink-700">
                    <span className="h-px w-4 bg-ink-300" />
                    “{q}”
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal className="lg:col-span-7" delay={120}>
              <AnswerVisual />
            </Reveal>
          </Container>
        </section>

        {/* ---------------- Bento ---------------- */}
        <section id="features" className="pb-24 sm:pb-32">
          <Container>
            <Reveal>
              <SectionHeading
                title="Everything the agent does, with you in control."
                body="Read, reply, broadcast, schedule and watch across all four channels from one conversation."
              />
            </Reveal>

            <div className="mt-12 grid gap-4 lg:grid-cols-6 lg:auto-rows-[minmax(0,auto)]">
              {/* Dominant tile */}
              <Reveal className="lg:col-span-4 lg:row-span-2 flex">
                <Tile
                  className="w-full"
                  title="Approve before anything is sent"
                  body="You see the exact message and every destination first. When a request is unclear, RelayFlow asks instead of guessing."
                >
                  <div className="grid sm:grid-cols-2 gap-4 h-full items-start">
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <div className="rounded-2xl rounded-br-md bg-brand-600 text-white px-3.5 py-2 text-[13px]">Tell the buyers the new prices are live</div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <AgentAvatar />
                        <div className="rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2.5 text-[13px] text-ink-700 shadow-xs">
                          Which group should I send this to: <b className="font-medium text-ink-900">Wholesale Buyers</b> or{" "}
                          <b className="font-medium text-ink-900">Lekki Store Customers</b>?
                        </div>
                      </div>
                    </div>
                    <ApprovalCard compact />
                  </div>
                </Tile>
              </Reveal>

              <Reveal className="lg:col-span-2 flex" delay={80}>
                <Tile className="w-full" title="Send to every channel at once" body="One message to a single group or all four channels together.">
                  <MiniCard className="p-3 space-y-1.5">
                    {CHANNELS.map((c) => (
                      <div key={c} className="flex items-center gap-2.5 h-7 text-[13px] text-ink-700">
                        <span className="grid place-items-center h-4 w-4 rounded-[4px] bg-brand-600 text-white">
                          <Check size={11} strokeWidth={3} />
                        </span>
                        <ChannelMark channel={c} size={13} className="text-ink-500" />
                        {CHANNEL_NAME[c]}
                      </div>
                    ))}
                  </MiniCard>
                </Tile>
              </Reveal>

              <Reveal className="lg:col-span-2 flex" delay={160}>
                <Tile className="w-full" title="Scheduled tasks in plain English" body="Describe it once. RelayFlow runs it on time, in your time zone.">
                  <MiniCard className="p-3.5">
                    <div className="flex items-center gap-2 text-[13px] text-ink-900 font-medium">
                      <Clock size={14} className="text-ink-500" /> Every weekday at 9:00
                    </div>
                    <p className="mt-1.5 text-[13px] text-ink-600">Good-morning message to Lekki Store Customers</p>
                    <div className="mt-3 pt-3 border-t border-line flex justify-between text-[12px] text-ink-500">
                      <span>Next run</span>
                      <span className="tabular-nums text-ink-700">Tomorrow, 9:00</span>
                    </div>
                  </MiniCard>
                </Tile>
              </Reveal>

              <Reveal className="lg:col-span-3 flex">
                <Tile className="w-full" title="Monitors that email you" body="Tell it what to watch for. It checks on a schedule and emails you only when it happens.">
                  <MiniCard className="p-3.5">
                    <div className="flex items-center gap-2 text-[13px] text-ink-900 font-medium">
                      <Radar size={14} className="text-ink-500" /> Someone asks about bulk pricing
                    </div>
                    <p className="mt-1 text-[12px] text-ink-500">Wholesale Buyers · checks every 30 min</p>
                    <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-surface px-3 py-2.5 text-[13px] text-ink-700">
                      <Mail size={14} className="mt-0.5 shrink-0 text-brand-600" />
                      <span>
                        <b className="font-medium text-ink-900">Matched 2h ago:</b> Chidi asked for a 50-carton quote.
                      </span>
                    </div>
                  </MiniCard>
                </Tile>
              </Reveal>

              <Reveal className="lg:col-span-3 flex" delay={80}>
                <Tile className="w-full" title="Auto-replies from your knowledge base" body="Add your FAQs and policies. RelayFlow answers only when your facts clearly cover the question.">
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <ChannelMark channel="whatsapp" size={14} className="mt-2 text-ink-400" />
                      <div className="rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2 text-[13px] text-ink-700 shadow-xs">Do you deliver on Sundays?</div>
                    </div>
                    <div className="flex justify-end">
                      <div className="max-w-[88%] rounded-2xl rounded-br-md bg-brand-600 text-white px-3.5 py-2 text-[13px]">
                        We deliver Monday to Saturday. Orders placed on Sunday go out Monday at 2pm.
                      </div>
                    </div>
                    <p className="text-right text-[11px] text-ink-500">Answered from your knowledge base</p>
                  </div>
                </Tile>
              </Reveal>
            </div>
          </Container>
        </section>

        {/* ---------------- How it works (real sequence) ---------------- */}
        <section id="how" className="py-24 sm:py-32 border-t border-line">
          <Container>
            <Reveal>
              <SectionHeading title="From sign-up to your first answer in minutes." />
            </Reveal>
            <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
              {[
                {
                  title: "Connect your channels",
                  body: "Scan a QR code for WhatsApp, sign in to Telegram, and authorize Slack and Gmail with their official sign-in.",
                  visual: (
                    <div className="flex items-center gap-3">
                      <span className="grid place-items-center h-12 w-12 rounded-lg border border-line bg-white text-ink-900 shadow-xs">
                        <QrCode size={26} strokeWidth={1.5} />
                      </span>
                      <div className="flex -space-x-1">
                        {CHANNELS.map((c) => (
                          <span key={c} className="grid place-items-center h-7 w-7 rounded-full border-2 border-white bg-surface" style={{ color: CHANNEL_COLOR[c] }}>
                            <ChannelMark channel={c} size={13} />
                          </span>
                        ))}
                      </div>
                    </div>
                  ),
                },
                {
                  title: "Ask anything",
                  body: "“What did people say on Telegram today?” RelayFlow reads recent messages and answers in seconds.",
                  visual: (
                    <div className="flex items-center gap-2 h-10 rounded-lg border border-line bg-white px-3 text-[13px] text-ink-500 shadow-xs">
                      What happened on Telegram today?
                      <span className="ml-auto h-4 w-px bg-ink-900 motion-safe:animate-pulse" />
                    </div>
                  ),
                },
                {
                  title: "Approve and send",
                  body: "Review the draft and destinations, then send to one group or every channel with a single approval.",
                  visual: (
                    <div className="flex items-center gap-2">
                      <span className="btn-primary h-9 px-3.5 text-[13px]">Approve and send</span>
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-500">
                        <CircleCheck size={14} className="text-brand-600" /> Sent to 3 groups
                      </span>
                    </div>
                  ),
                },
              ].map((s, n) => (
                <li key={s.title} className="list-none">
                  <Reveal delay={n * 100}>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[12px] text-ink-500 tabular-nums">0{n + 1}</span>
                      <span className="h-px flex-1 bg-line" />
                    </div>
                    <div className="mt-6 h-12 flex items-center">{s.visual}</div>
                    <h3 className="mt-6 text-title font-medium text-ink-900">{s.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{s.body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        {/* ---------------- Security (heading + hairline list) ---------------- */}
        <section className="py-24 sm:py-32 border-t border-line">
          <Container className="grid lg:grid-cols-12 gap-12">
            <Reveal className="lg:col-span-5">
              <SectionHeading
                title="Built so nothing leaves without you."
                body="RelayFlow works inside your real conversations, so it’s designed to be careful by default."
              />
            </Reveal>
            <Reveal className="lg:col-span-6 lg:col-start-7" delay={100}>
              <dl className="divide-y divide-line border-y border-line">
                {[
                  { icon: ShieldCheck, t: "Approval before the agent sends", d: "Messages, broadcasts and scheduled tasks wait for your OK. Auto-replies run only on channels you switch them on for." },
                  { icon: KeyRound, t: "Official sign-in for Slack and Gmail", d: "Connected through OAuth. RelayFlow never sees your Slack or Google password." },
                  { icon: Lock, t: "Encrypted credentials", d: "Channel sessions and tokens are encrypted at the field level before they’re stored." },
                  { icon: Clock, t: "Only recent context", d: "It keeps about a week of messages to answer questions, not your full history." },
                ].map((row) => (
                  <div key={row.t} className="flex gap-4 py-5">
                    <row.icon size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ink-500" />
                    <div>
                      <dt className="text-[15px] font-medium text-ink-900">{row.t}</dt>
                      <dd className="mt-1 text-[15px] leading-relaxed text-ink-600">{row.d}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </Reveal>
          </Container>
        </section>

        {/* ---------------- Customers ---------------- */}
        <section className="py-24 sm:py-32 border-t border-line">
          <Container>
            <Reveal>
              <SectionHeading title="What changed for our customers." />
            </Reveal>
            <div className="mt-12 grid md:grid-cols-2 gap-4">
              {customers.map((c, n) => {
                const body = (
                  <>
                    <div className="flex items-center justify-between gap-4">
                      {c.wordmark ? (
                        <span className="text-[24px] font-semibold tracking-[-0.03em] text-ink-900">ScalePad</span>
                      ) : (
                        <img src={c.logo} alt={c.name} className="h-8 w-auto object-contain" />
                      )}
                      {c.href && <ArrowUpRight size={18} className="text-ink-400 transition-colors group-hover:text-ink-900" />}
                    </div>
                    <div className="mt-12 flex items-end gap-5">
                      <span className="text-display-lg font-semibold text-ink-900 tabular-nums">{c.result}</span>
                      <span className="pb-2 text-[15px] leading-snug text-ink-600 max-w-[230px]">{c.outcome}</span>
                    </div>
                    <div className="mt-8 pt-5 border-t border-line flex justify-between gap-4 text-[13px] text-ink-500">
                      <span>{c.context}</span>
                      <span>Customer-reported</span>
                    </div>
                  </>
                );
                const cls = "group block rounded-2xl border border-line bg-white p-7 sm:p-8 transition-[border-color,box-shadow] duration-200";
                return (
                  <Reveal key={c.name} delay={n * 100}>
                    {c.href ? (
                      <a href={c.href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:border-line-strong hover:shadow-md`}>
                        {body}
                      </a>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </Reveal>
                );
              })}
            </div>
          </Container>
        </section>

        {/* ---------------- Pricing ---------------- */}
        <section id="pricing" className="py-24 sm:py-32 border-t border-line">
          <Container className="grid lg:grid-cols-12 gap-12 items-start">
            <Reveal className="lg:col-span-5">
              <SectionHeading
                title="One plan. Everything included."
                body="Try everything free for 1 day, no credit card required. Then $15 a month. No usage credits, no tiers, no surprises."
              />
              <a href="#faq" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-brand-700 hover:text-brand-800 transition-colors">
                Read the FAQ <ArrowRight size={15} />
              </a>
            </Reveal>
            <Reveal className="lg:col-span-6 lg:col-start-7" delay={100}>
              <div className="rounded-3xl border border-line bg-white p-7 sm:p-9 shadow-md">
                <div className="flex items-center justify-between">
                  <h3 className="text-[16px] font-medium text-ink-900">Pro</h3>
                  <span className="rounded-full border border-line px-2.5 h-6 inline-flex items-center text-[12px] text-ink-600">1-day free trial</span>
                </div>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-display-lg font-semibold text-ink-900 tabular-nums">$15</span>
                  <span className="text-[15px] text-ink-500">/month</span>
                </div>
                <ul className="mt-8 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  {planFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[14px] text-ink-700">
                      <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to={loggedIn ? "/app" : "/signup"} className="btn-primary mt-9 h-11 w-full text-[15px]">
                  {loggedIn ? "Go to dashboard" : "Start free trial"}
                </Link>
                <p className="mt-3 text-center text-[13px] text-ink-500">No credit card required for the trial · Cancel anytime</p>
              </div>
            </Reveal>
          </Container>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section id="faq" className="py-24 sm:py-32 border-t border-line">
          <Container className="grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-4">
              <div className="lg:sticky lg:top-28">
                <SectionHeading title="Questions, answered." />
              </div>
            </div>
            <div className="lg:col-span-7 lg:col-start-6">
              <div className="divide-y divide-line border-y border-line">
                {faqs.map((f, n) => {
                  const open = openFaq === n;
                  return (
                    <div key={f.q}>
                      <button
                        type="button"
                        onClick={() => setOpenFaq(open ? null : n)}
                        aria-expanded={open}
                        aria-controls={`faq-${n}`}
                        className="w-full flex items-center justify-between gap-6 py-5 text-left"
                      >
                        <span className="text-[16px] font-medium text-ink-900">{f.q}</span>
                        <ChevronDown
                          size={18}
                          className={`shrink-0 text-ink-400 transition-transform duration-200 ease-out ${open ? "rotate-180" : ""}`}
                        />
                      </button>
                      <div
                        id={`faq-${n}`}
                        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                      >
                        <div className="overflow-hidden">
                          <p className="pb-5 pr-10 text-[15px] leading-relaxed text-ink-600">{f.a}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Container>
        </section>

        {/* ---------------- Final CTA ---------------- */}
        <section className="py-24 sm:py-32 border-t border-line">
          <Container>
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="text-display-sm sm:text-display-lg font-semibold text-ink-900">Put one agent on every chat.</h2>
              <p className="mt-5 text-lead text-ink-600">Connect your first channel in about a minute. No credit card required.</p>
              <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
                {primaryCta}
                {!loggedIn && (
                  <Link to="/login" className="btn-ghost h-11 px-5 text-[15px]">
                    Sign in
                  </Link>
                )}
              </div>
            </Reveal>
          </Container>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <Container className="py-12">
          <div className="flex flex-col md:flex-row md:justify-between gap-10">
            <div className="max-w-xs">
              <Logo byline />
              <p className="mt-4 text-[14px] leading-relaxed text-ink-500">One AI agent across WhatsApp, Telegram, Slack and Gmail.</p>
            </div>
            <div className="grid grid-cols-2 gap-10 sm:gap-16">
              <div>
                <h3 className="text-[13px] font-medium text-ink-900">Product</h3>
                <ul className="mt-4 space-y-2.5 text-[14px] text-ink-600">
                  <li><a href="#features" className="hover:text-ink-900 transition-colors">Features</a></li>
                  <li><a href="#how" className="hover:text-ink-900 transition-colors">How it works</a></li>
                  <li><a href="#pricing" className="hover:text-ink-900 transition-colors">Pricing</a></li>
                  <li><a href="#faq" className="hover:text-ink-900 transition-colors">FAQ</a></li>
                </ul>
              </div>
              <div>
                <h3 className="text-[13px] font-medium text-ink-900">Account</h3>
                <ul className="mt-4 space-y-2.5 text-[14px] text-ink-600">
                  <li><Link to="/login" className="hover:text-ink-900 transition-colors">Sign in</Link></li>
                  <li><Link to="/signup" className="hover:text-ink-900 transition-colors">Start free trial</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-6 border-t border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[13px] text-ink-500">
            <span>© {new Date().getFullYear()} RelayFlow</span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck size={14} className="text-ink-400" />
              Encrypted credentials · Official OAuth
            </span>
          </div>
        </Container>
      </footer>
    </div>
  );
}
