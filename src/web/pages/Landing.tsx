import { Link } from "react-router-dom";
import { Logo } from "../components/Logo";
import { MessageSquare, Send, Plug, Clock, ShieldCheck, Sparkles } from "lucide-react";

const channels = [
  { name: "WhatsApp", color: "#25D366" },
  { name: "Telegram", color: "#229ED9" },
  { name: "Slack", color: "#611f69" },
  { name: "Gmail", color: "#EA4335" },
];

const testimonials = [
  {
    quote: "RelayFlow found a product-demand shift in minutes that would have taken our team days of scrolling.",
    name: "Ada Okafor",
    role: "Head of Customer Operations",
  },
  {
    quote: "One place to ask about every conversation and send a single message to all our groups. It replaced three tabs.",
    name: "Daniel Mensah",
    role: "Founder, Retail",
  },
  {
    quote: "The approve-before-send step means the AI never does anything I didn't sign off on. That's the part I trust.",
    name: "Priya Nair",
    role: "Community Lead",
  },
];

export default function Landing() {
  return (
    <div className="min-h-full bg-white text-ink-800">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-line">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-3">
            <Link to="/login" className="text-[15px] font-semibold text-ink-600 hover:text-ink-900 px-3 py-2">Sign in</Link>
            <Link to="/signup" className="btn-primary h-10 px-4">Get started</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold px-3 py-1.5">
            <Sparkles size={15} /> One agent. Every channel.
          </span>
          <h1 className="mt-5 text-[44px] sm:text-[56px] leading-[1.03] font-extrabold tracking-tight text-ink-900">
            One AI agent across <span className="text-brand-600">every business chat.</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-600 max-w-xl">
            Connect WhatsApp, Telegram, Slack, and Gmail. Then just talk to RelayFlow — ask what's been said,
            summarize any channel, and send one message everywhere. It always asks before it sends.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/signup" className="btn-primary h-12 px-6 text-base">Start free</Link>
            <Link to="/login" className="btn-ghost h-12 px-6 text-base">Sign in</Link>
          </div>
          <div className="mt-8 flex items-center gap-5 text-sm text-ink-500">
            {channels.map((c) => (
              <span key={c.name} className="inline-flex items-center gap-2 font-medium">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
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
              <span className="ml-2 text-sm font-semibold text-ink-500">RelayFlow · Chat</span>
            </div>
            <div className="pt-4 space-y-3">
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-brand-50 text-brand-800 px-4 py-2.5 text-[15px]">
                Summarize what's been discussed on WhatsApp today, then send a thank-you to all channels.
              </div>
              <div className="flex items-start gap-2.5">
                <span className="grid place-items-center h-8 w-8 rounded-lg text-white" style={{ background: "linear-gradient(135deg,#22c1d6,#4f46e5)" }}>
                  <Sparkles size={16} />
                </span>
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-white px-4 py-3 text-[15px] text-ink-700">
                  <p className="text-ink-900 font-semibold mb-1">Here's today on WhatsApp</p>
                  3 customers asked about delivery times; 1 reported a delayed order. I've drafted a thank-you —
                  <span className="text-brand-700 font-medium"> review & approve to send to all 4 channels.</span>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-4 card px-4 py-3 flex items-center gap-3">
            <ShieldCheck size={20} className="text-emerald-600" />
            <div className="text-sm">
              <div className="font-semibold text-ink-900">Approve before send</div>
              <div className="text-ink-500">Nothing goes out without you.</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-16 border-t border-line">
        <h2 className="text-3xl font-bold tracking-tight text-ink-900 text-center">How it works</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {[
            { icon: Plug, title: "Connect your channels", body: "Scan a WhatsApp QR, sign in to Telegram, or authorize Slack & Gmail. Clear connected / disconnected status, always." },
            { icon: MessageSquare, title: "Ask anything", body: "\"What did people say on Telegram today?\" RelayFlow reads recent messages and answers — no scrolling." },
            { icon: Send, title: "Act with one approval", body: "Send one message to every channel at once. RelayFlow drafts it; you approve; it delivers." },
          ].map((s) => (
            <div key={s.title} className="card p-6">
              <span className="grid place-items-center h-11 w-11 rounded-xl bg-brand-50 text-brand-600">
                <s.icon size={20} />
              </span>
              <h3 className="mt-4 text-lg font-bold text-ink-900">{s.title}</h3>
              <p className="mt-2 text-ink-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Sparkles, title: "360° awareness", body: "The agent always knows which channels are connected — and tells you when one drops." },
            { icon: Clock, title: "Scheduled tasks", body: "\"Every morning at 9, send a good-morning to WhatsApp.\" Set it once; RelayFlow runs it." },
            { icon: ShieldCheck, title: "You're in control", body: "Every send is drafted and confirmed. It asks when unsure instead of guessing." },
          ].map((s) => (
            <div key={s.title} className="p-6">
              <span className="grid place-items-center h-11 w-11 rounded-xl bg-brand-50 text-brand-600">
                <s.icon size={20} />
              </span>
              <h3 className="mt-4 text-lg font-bold text-ink-900">{s.title}</h3>
              <p className="mt-2 text-ink-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-6xl px-6 py-16 border-t border-line">
        <h2 className="text-3xl font-bold tracking-tight text-ink-900 text-center">Loved by fast-moving teams</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <figure key={t.name} className="card p-6 flex flex-col">
              <blockquote className="text-ink-800 leading-relaxed text-[15px]">“{t.quote}”</blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="grid place-items-center h-10 w-10 rounded-full bg-brand-100 text-brand-700 font-bold">
                  {t.name[0]}
                </span>
                <div>
                  <div className="font-semibold text-ink-900">{t.name}</div>
                  <div className="text-sm text-ink-500">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-3xl bg-ink-900 text-white px-8 py-14 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Put one agent across all your chats.</h2>
          <p className="mt-3 text-white/70 text-lg">Connect your first channel in under a minute.</p>
          <Link to="/signup" className="btn-primary h-12 px-7 text-base mt-7 bg-white text-ink-900 hover:bg-white/90">
            Get started free
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-ink-500">
          <Logo size={26} />
          <span>© {new Date().getFullYear()} RelayFlow. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
