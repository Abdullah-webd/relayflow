import { flushSync } from "react-dom";
import { Link, useNavigate, type LinkProps } from "react-router-dom";
import type { HTMLAttributes, ReactNode } from "react";
import { CircleCheck, ShieldCheck } from "lucide-react";
import { Logo } from "../../components/Logo";
import { ChannelMark, CHANNEL_NAME, type Channel } from "../../components/ChannelMark";
import { gsap, SplitText } from "../../lib/gsap";

// ---------------------------------------------------------------------------
// Layout + type
// ---------------------------------------------------------------------------

export function Container({ children, className = "", ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement> & { "data-verify-ignore"?: boolean }) {
  return (
    <div className={`mx-auto max-w-container px-5 sm:px-6 ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** Section display heading. `data-split` gets a masked line reveal from the section's motion code. */
export function Display({ children, className = "", as: Tag = "h2" }: { children: ReactNode; className?: string; as?: "h1" | "h2" | "h3" }) {
  return (
    <Tag data-split className={`font-display font-semibold text-navy tracking-[-0.035em] leading-[0.98] ${className}`}>
      {children}
    </Tag>
  );
}

/** Masked line reveal for every [data-split] heading inside `scope`. Call inside a motion branch of gsap.matchMedia. */
export function splitHeadings(scope: Element, start = "top 85%") {
  scope.querySelectorAll<HTMLElement>("[data-split]").forEach((el) => {
    SplitText.create(el, {
      type: "lines",
      mask: "lines",
      linesClass: "split-line",
      autoSplit: true,
      onSplit(self) {
        return gsap.from(self.lines, {
          yPercent: 110,
          duration: 1.05,
          stagger: 0.1,
          ease: "expo.out",
          scrollTrigger: { trigger: el, start, once: true },
        });
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Links: route changes cross-fade with the View Transitions API where supported
// ---------------------------------------------------------------------------

export function TransitionLink({ to, onClick, ...rest }: LinkProps) {
  const navigate = useNavigate();
  return (
    <Link
      to={to}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || reduce || !("startViewTransition" in document)) return;
        e.preventDefault();
        (document as Document & { startViewTransition: (cb: () => void) => unknown }).startViewTransition(() => {
          flushSync(() => navigate(to));
          window.scrollTo(0, 0);
        });
      }}
    />
  );
}

/** Primary/ghost button whose label rolls up on hover (two stacked copies). */
export function RollLabel({ children }: { children: ReactNode }) {
  return (
    <span className="roll" aria-hidden={false}>
      <span className="roll-a">{children}</span>
      <span className="roll-b" aria-hidden>
        {children}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Product fragments (real UI, not screenshots)
// ---------------------------------------------------------------------------

export function ChannelDot({ channel, size = 14 }: { channel: Channel; size?: number }) {
  return <ChannelMark channel={channel} size={size} className="shrink-0" title={CHANNEL_NAME[channel]} />;
}

export function AgentAvatar() {
  return (
    <span className="shrink-0 mt-0.5">
      <Logo size={24} showText={false} />
    </span>
  );
}

export function ApprovalCard({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const tags: [Channel, string][] = compact
    ? [["whatsapp", "Lekki Store Customers"], ["slack", "#support"]]
    : [["whatsapp", "Lekki Store Customers"], ["whatsapp", "Wholesale Buyers"], ["slack", "#support"]];
  return (
    <div className={`approval rounded-2xl border border-line bg-white shadow-card ${className}`}>
      <div className="flex items-center justify-between px-4 h-11 border-b border-line">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-900">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> Ready to send
        </span>
        <span className="text-[12px] text-ink-500">Needs your approval</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {tags.map(([c, label]) => (
            <span key={label} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 h-6 text-[12px] text-ink-700">
              <ChannelMark channel={c} size={11} className="text-ink-500" />
              {label}
            </span>
          ))}
        </div>
        <p className="rounded-lg bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink-700">
          Hi everyone, deliveries to Lekki and Victoria Island leave daily at 2pm and arrive the next morning. Order #4821 ships today. Thanks for your patience.
        </p>
        <div className="flex gap-2">
          <span className="approve-btn btn-primary h-8 px-3 text-[13px] flex-1 relative overflow-hidden">
            <span className="approve-idle">Approve and send</span>
            <span className="approve-done absolute inset-0 grid place-items-center gap-1.5 bg-brand-700 opacity-0">
              <span className="inline-flex items-center gap-1.5">
                <CircleCheck size={14} /> Sent to {tags.length} groups
              </span>
            </span>
          </span>
          <span className="btn-ghost h-8 px-3 text-[13px]">Edit</span>
        </div>
      </div>
    </div>
  );
}

const inbox: { channel: Channel; name: string; unread: number; active?: boolean }[] = [
  { channel: "whatsapp", name: "Lekki Store Customers", unread: 12, active: true },
  { channel: "whatsapp", name: "Wholesale Buyers", unread: 3 },
  { channel: "telegram", name: "Dev Syndicate", unread: 5 },
  { channel: "slack", name: "#support", unread: 2 },
  { channel: "slack", name: "#sales", unread: 7 },
];

/** The hero product window. Children with `.pw-step` are choreographed by the hero timeline. */
export function ProductWindow() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-white shadow-frame">
      <div className="flex items-center justify-between h-12 px-4 border-b border-line">
        <div className="flex items-center gap-2.5 text-[13px]">
          <Logo size={20} showText={false} />
          <span className="font-medium text-ink-900">RelayFlow</span>
          <span className="hidden sm:inline text-ink-300">/</span>
          <span className="hidden sm:inline text-ink-500">Morning check-in</span>
        </div>
        <span className="inline-flex items-center gap-2 text-[12px] text-ink-500">
          <span className="relative h-2 w-2 rounded-full bg-accent-500" />
          <span className="sm:hidden">4 live</span>
          <span className="hidden sm:inline">4 channels connected</span>
        </span>
      </div>

      <div className="grid md:grid-cols-[232px_1fr] lg:grid-cols-[232px_1fr_320px] min-h-[420px]">
        <aside className="hidden md:block border-r border-line bg-surface/50 p-3">
          <div className="px-2 pb-2 text-[12px] font-medium text-ink-500">Channels</div>
          <ul className="space-y-0.5">
            {inbox.map((row) => (
              <li
                key={row.name}
                className={`pw-row flex items-center gap-2.5 rounded-lg px-2 h-9 text-[13px] ${row.active ? "bg-white shadow-xs text-ink-900" : "text-ink-600"}`}
              >
                <ChannelMark channel={row.channel} size={14} className="shrink-0" />
                <span className="truncate flex-1">{row.name}</span>
                <span className="font-mono text-[11px] tabular-nums text-ink-500">{row.unread}</span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="p-4 sm:p-6 space-y-4">
          <div className="pw-step flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 text-white px-4 py-2.5 text-[14px] leading-relaxed">
              What did customers ask about today? Draft a reply to the delivery questions.
            </div>
          </div>
          <div className="pw-step flex items-center gap-2 pl-9 font-mono text-[11px] text-ink-500">
            <CircleCheck size={13} className="text-brand-600" />
            Read 27 messages across 4 channels
          </div>
          <div className="pw-step flex items-start gap-3">
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
          <div className="pw-step lg:hidden pl-9">
            <ApprovalCard compact />
          </div>
        </div>

        <div className="hidden lg:block border-l border-line bg-surface/50 p-4">
          <div className="pw-step">
            <ApprovalCard />
          </div>
          <div className="pw-step mt-3 flex items-center gap-2 px-1 text-[12px] text-ink-500">
            <ShieldCheck size={14} className="text-ink-400" />
            Nothing is sent until you approve.
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnswerVisual() {
  return (
    <div className="answer rounded-3xl border border-line bg-white shadow-frame overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center gap-3">
        <span className="text-[14px] text-ink-900 font-medium">Anything urgent in the last 24 hours?</span>
      </div>
      <div className="p-5 space-y-5 text-[14px]">
        <div>
          <div className="ans-label text-[12px] font-medium text-ink-500 mb-2">Needs you · 2</div>
          <div className="space-y-2">
            {[
              { c: "slack" as Channel, who: "Priya Nair", what: "Asked in #sales to move Thursday’s supplier call to Friday.", when: "2h ago" },
              { c: "whatsapp" as Channel, who: "Chidi Okafor", what: "Wants a quote for 50 cartons before 5pm.", when: "35m ago" },
            ].map((r) => (
              <div key={r.who} className="ans-urgent relative flex items-start gap-3 rounded-xl border border-line px-3.5 py-3">
                <span className="ans-ping absolute -left-px top-3 bottom-3 w-[3px] rounded-full bg-ping origin-top" aria-hidden />
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
          <div className="ans-label text-[12px] font-medium text-ink-500 mb-2">For your information · 3</div>
          <ul className="space-y-1.5 text-ink-600">
            <li className="ans-fyi flex gap-2"><ChannelMark channel="telegram" size={14} className="mt-1 text-ink-400" />Dev Syndicate agreed to ship v2.3 on Monday.</li>
            <li className="ans-fyi flex gap-2"><ChannelMark channel="slack" size={14} className="mt-1 text-ink-400" />#support closed 14 tickets, 2 still open.</li>
            <li className="ans-fyi flex gap-2"><ChannelMark channel="whatsapp" size={14} className="mt-1 text-ink-400" />Wholesale Buyers shared the new price list.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/** A chat bubble from a channel, used as motion material (hero convergence, chaos wall). */
export function ChatBubble({ channel, from, text, className = "" }: { channel: Channel; from: string; text: string; className?: string }) {
  return (
    <div className={`inline-flex max-w-[300px] items-start gap-2.5 rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2.5 shadow-md ${className}`}>
      <ChannelMark channel={channel} size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-ink-500">{from}</div>
        <div className="text-[13.5px] leading-snug text-ink-800">{text}</div>
      </div>
    </div>
  );
}
