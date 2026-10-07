import { useRef, type ReactNode } from "react";
import { Check, CircleCheck, Mail, Radar } from "lucide-react";
import { ChannelMark, CHANNEL_NAME, type Channel } from "../../components/ChannelMark";
import { gsap, ScrollTrigger, useGSAP } from "../../lib/gsap";
import { AgentAvatar, ApprovalCard, Container, Display, splitHeadings } from "./ui";

const CHANNELS: Channel[] = ["whatsapp", "telegram", "slack"];

function Bubble({ me, children, className = "" }: { me?: boolean; children: ReactNode; className?: string }) {
  return me ? (
    <div className={`flex justify-end ${className}`}>
      <div className="max-w-[88%] rounded-2xl rounded-br-md bg-brand-600 text-white px-3.5 py-2 text-[13.5px] leading-snug">{children}</div>
    </div>
  ) : (
    <div className={`flex items-start gap-2.5 ${className}`}>{children}</div>
  );
}

// Each capability: copy + a live UI fragment that plays its own short story (story(card) builds it).
type Cap = { title: string; body: string; visual: ReactNode; story: (q: (s: string) => Element[]) => gsap.core.Timeline };

const caps: Cap[] = [
  {
    title: "Approve before anything is sent",
    body: "You see the exact message and every destination first. When a request is unclear, RelayFlow asks instead of guessing.",
    visual: (
      <div className="space-y-3 w-full max-w-[420px]">
        <Bubble me className="st">Tell the buyers the new prices are live</Bubble>
        <Bubble className="st">
          <AgentAvatar />
          <div className="rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2.5 text-[13.5px] text-ink-700 shadow-xs">
            Which group should I send this to: <b className="font-medium text-ink-900">Wholesale Buyers</b> or <b className="font-medium text-ink-900">Lekki Store Customers</b>?
          </div>
        </Bubble>
        <ApprovalCard compact className="st" />
      </div>
    ),
    story: (q) =>
      gsap
        .timeline()
        .from(q(".st"), { y: 18, autoAlpha: 0, stagger: 0.35, duration: 0.6 })
        .to(q(".approve-btn"), { scale: 0.96, duration: 0.12, ease: "power2.out" }, "+=0.5")
        .to(q(".approve-btn"), { scale: 1, duration: 0.25, ease: "power2.out" })
        .to(q(".approve-done"), { autoAlpha: 1, duration: 0.25 }, "<"),
  },
  {
    title: "Send to every channel at once",
    body: "One message to a single group or every channel together. Each destination is ticked before it goes.",
    visual: (
      <div className="w-full max-w-[380px] rounded-2xl border border-line bg-white p-4 shadow-md">
        <div className="text-[12px] font-medium text-ink-500 mb-2">Send to</div>
        {CHANNELS.map((c) => (
          <div key={c} className="flex items-center gap-3 h-11 border-b border-line last:border-0 text-[14px] text-ink-800">
            <span className="relative grid place-items-center h-5 w-5 rounded-[5px] border border-line-strong bg-white">
              <span className="tick absolute inset-0 grid place-items-center rounded-[5px] bg-brand-600 text-white">
                <Check size={13} strokeWidth={3} />
              </span>
            </span>
            <ChannelMark channel={c} size={15} />
            {CHANNEL_NAME[c]}
            <span className="sent ml-auto inline-flex items-center gap-1 text-[12px] text-brand-700">
              <CircleCheck size={13} /> Sent
            </span>
          </div>
        ))}
      </div>
    ),
    story: (q) =>
      gsap
        .timeline()
        .from(q(".tick"), { scale: 0.6, autoAlpha: 0, stagger: 0.28, duration: 0.35, ease: "back.out(2)" })
        .from(q(".sent"), { x: -10, autoAlpha: 0, stagger: 0.18, duration: 0.45 }, "+=0.35"),
  },
  {
    title: "Scheduled tasks in plain English",
    body: "Describe it once. RelayFlow runs it on time, in your time zone.",
    visual: (
      <div className="w-full max-w-[380px] rounded-2xl border border-line bg-white p-5 shadow-md">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0" aria-hidden>
            <circle cx="20" cy="20" r="17" fill="none" className="stroke-wire" strokeWidth="2.5" />
            <line x1="20" y1="20" x2="20" y2="10" className="stroke-navy" strokeWidth="2.5" strokeLinecap="round" />
            <line className="clock-hand stroke-signal" x1="20" y1="20" x2="28" y2="20" strokeWidth="2" strokeLinecap="round" style={{ transformOrigin: "20px 20px" }} />
          </svg>
          <div>
            <div className="text-[15px] font-medium text-ink-900">Every weekday at 9:00</div>
            <div className="text-[13px] text-ink-600">Good-morning message to Lekki Store Customers</div>
          </div>
        </div>
        <div className="next mt-4 pt-3 border-t border-line flex justify-between text-[12px] text-ink-500">
          <span>Next run</span>
          <span className="tabular-nums text-ink-700">Tomorrow, 9:00</span>
        </div>
      </div>
    ),
    story: (q) =>
      gsap
        .timeline()
        .from(q(".clock-hand"), { rotate: -270, duration: 1.4, ease: "expo.out" })
        .from(q(".next"), { y: 10, autoAlpha: 0, duration: 0.5 }, 0.5),
  },
  {
    title: "Monitors that email you",
    body: "Tell it what to watch for. It checks every new message as it arrives and emails you within seconds when it happens.",
    visual: (
      <div className="w-full max-w-[400px] space-y-3">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-md">
          <div className="flex items-center gap-2 text-[14px] text-ink-900 font-medium">
            <Radar size={15} className="text-ink-500" /> Someone asks about bulk pricing
          </div>
          <p className="mt-1 text-[12px] text-ink-500">Wholesale Buyers · instant alerts</p>
        </div>
        <div className="incoming relative flex items-start gap-2.5 rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2.5 shadow-sm">
          <span className="match absolute -left-px top-2.5 bottom-2.5 w-[3px] rounded-full bg-ping origin-top" aria-hidden />
          <ChannelMark channel="whatsapp" size={15} className="mt-0.5" />
          <div>
            <div className="text-[11px] font-medium text-ink-500">Wholesale Buyers · Chidi Okafor</div>
            <div className="text-[13.5px] text-ink-800">What’s your price for 50 cartons?</div>
          </div>
        </div>
        <div className="mail flex items-start gap-2.5 rounded-xl bg-brand-50 px-3.5 py-3 text-[13px] text-ink-700">
          <Mail size={15} className="mt-0.5 shrink-0 text-brand-600" />
          <span>
            <b className="font-medium text-ink-900">Matched just now:</b> Chidi asked for a 50-carton quote.
          </span>
        </div>
      </div>
    ),
    story: (q) =>
      gsap
        .timeline()
        .from(q(".incoming"), { x: -30, autoAlpha: 0, duration: 0.6 })
        .from(q(".match"), { scaleY: 0, duration: 0.4 }, "+=0.2")
        .from(q(".mail"), { y: -16, autoAlpha: 0, duration: 0.6 }, "+=0.15"),
  },
  {
    title: "Auto-replies from your knowledge base",
    body: "Add your FAQs and policies. RelayFlow answers only when your facts clearly cover the question.",
    visual: (
      <div className="w-full max-w-[400px] space-y-2.5">
        <div className="q flex items-start gap-2.5">
          <ChannelMark channel="whatsapp" size={15} className="mt-2.5 text-ink-400" />
          <div className="rounded-2xl rounded-tl-md border border-line bg-white px-3.5 py-2 text-[13.5px] text-ink-700 shadow-xs">Do you deliver on Sundays?</div>
        </div>
        <div className="relative h-[52px]">
          <div className="dots invisible opacity-0 absolute right-0 top-1 inline-flex gap-1 rounded-2xl rounded-br-md bg-brand-50 px-3.5 py-3">
            {[0, 1, 2].map((d) => (
              <span key={d} className="dot h-1.5 w-1.5 rounded-full bg-brand-600" />
            ))}
          </div>
          <div className="reply absolute right-0 top-0 max-w-[88%] rounded-2xl rounded-br-md bg-brand-600 text-white px-3.5 py-2 text-[13.5px]">
            We deliver Monday to Saturday. Orders placed on Sunday go out Monday at 2pm.
          </div>
        </div>
        <p className="kb text-right text-[11px] text-ink-500 pt-3">Answered from your knowledge base</p>
      </div>
    ),
    story: (q) =>
      gsap
        .timeline()
        .from(q(".q"), { y: 14, autoAlpha: 0, duration: 0.5 })
        .to(q(".dots"), { autoAlpha: 1, duration: 0.2 }, "+=0.2")
        .to(q(".dot"), { y: -3, duration: 0.3, stagger: 0.12, yoyo: true, repeat: 3, ease: "sine.inOut" })
        .to(q(".dots"), { autoAlpha: 0, duration: 0.15 })
        .from(q(".reply"), { y: 10, autoAlpha: 0, duration: 0.5 }, "<")
        .from(q(".kb"), { autoAlpha: 0, duration: 0.4 }),
  },
];

export function Capabilities() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 1024px)" }, (ctx) => {
        const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean };
        if (!motion) return;
        splitHeadings(root.current!);
        gsap.from(".caps-lead", { y: 16, autoAlpha: 0, duration: 0.8, scrollTrigger: { trigger: ".caps-lead", start: "top 88%", once: true } });

        const cards = gsap.utils.toArray<HTMLElement>(".cap-card");
        cards.forEach((card, i) => {
          const q = gsap.utils.selector(card);
          const story = caps[i].story(q as (s: string) => Element[]).pause();
          gsap.from(card.querySelector(".cap-copy"), {
            y: 24,
            autoAlpha: 0,
            duration: 0.9,
            scrollTrigger: { trigger: card, start: "top 75%", once: true },
          });
          // The story plays once when its card lands.
          ScrollTrigger.create({ trigger: card, start: desktop ? "top 55%" : "top 70%", once: true, onEnter: () => story.play(0) });

          // Depth: the card underneath recedes as the next one slides over it.
          if (desktop && i < cards.length - 1) {
            gsap.to(card, {
              scale: 0.94,
              ease: "none",
              scrollTrigger: { trigger: cards[i + 1], start: "top bottom", end: "top 30%", scrub: true },
            });
            gsap.to(card.querySelector(".cap-shade"), {
              autoAlpha: 1,
              ease: "none",
              scrollTrigger: { trigger: cards[i + 1], start: "top bottom", end: "top 30%", scrub: true },
            });
          }
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="features" data-section className="py-24 sm:py-32">
      <Container>
        <div className="max-w-3xl">
          <Display className="text-[clamp(2.4rem,5vw,4.5rem)]">Everything the agent does, with you in control.</Display>
          <p className="caps-lead mt-6 text-[17px] leading-relaxed text-ink-600 max-w-[52ch]">
            Read, reply, broadcast, schedule and watch across all your channels from one conversation.
          </p>
        </div>

        <div className="mt-14 sm:mt-20 space-y-5 lg:space-y-[14vh]">
          {caps.map((c, i) => (
            <article
              key={c.title}
              className="cap-card relative lg:sticky origin-top rounded-[28px] border border-line bg-white shadow-frame overflow-hidden"
              style={{ top: `calc(96px + ${i * 16}px)` }}
            >
              <div className="cap-shade pointer-events-none absolute inset-0 z-10 bg-navy/[0.06] opacity-0 invisible" aria-hidden />
              <div className="grid lg:grid-cols-2 lg:h-[min(540px,calc(100svh-150px))]">
                <div className="cap-copy p-7 sm:p-10 lg:p-14 flex flex-col justify-center">
                  <h3 className="font-display font-semibold text-navy text-[clamp(1.9rem,3.2vw,3rem)] leading-[1.02] tracking-[-0.03em] max-w-[16ch]">{c.title}</h3>
                  <p className="mt-4 text-[16px] leading-relaxed text-ink-600 max-w-[42ch]">{c.body}</p>
                </div>
                <div className="relative grid place-items-center p-6 sm:p-10 lg:p-10 bg-[linear-gradient(180deg,rgb(var(--brand-50)/0.7),rgb(var(--brand-50)/0.25))] lg:border-l border-t lg:border-t-0 border-line">
                  {c.visual}
                </div>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
