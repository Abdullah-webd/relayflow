import { useRef } from "react";
import type { Channel } from "../../components/ChannelMark";
import { gsap, useGSAP } from "../../lib/gsap";
import { AnswerVisual, ChatBubble, Container, Display, splitHeadings } from "./ui";

// The noise a business owner would otherwise read one by one.
const noise: { c: Channel; from: string; t: string; x: number; y: number; r: number }[] = [
  { c: "whatsapp", from: "Lekki Store Customers", t: "Pls is the delivery today?", x: 2, y: 4, r: -4 },
  { c: "slack", from: "#general", t: "lunch is here 🍲", x: 46, y: 0, r: 3 },
  { c: "whatsapp", from: "Wholesale Buyers", t: "Who has the new price list?", x: 58, y: 14, r: -2 },
  { c: "telegram", from: "Dev Syndicate", t: "merged #219", x: 8, y: 22, r: 2 },
  { c: "slack", from: "#sales · Priya Nair", t: "Can we move Thursday’s call to Friday?", x: 30, y: 30, r: -3 },
  { c: "whatsapp", from: "Lekki Store Customers", t: "Order #4821 is late o", x: 62, y: 38, r: 4 },
  { c: "telegram", from: "Dev Syndicate", t: "v2.3 ships Monday", x: 0, y: 46, r: -1 },
  { c: "whatsapp", from: "Chidi Okafor", t: "Quote for 50 cartons before 5pm?", x: 38, y: 54, r: 2 },
  { c: "slack", from: "#support", t: "closing 14 tickets now", x: 64, y: 62, r: -4 },
  { c: "whatsapp", from: "Wholesale Buyers", t: "👍", x: 14, y: 68, r: 5 },
  { c: "slack", from: "#support · Daniel Ruiz", t: "Any update on my refund?", x: 24, y: 80, r: -2 },
  { c: "whatsapp", from: "Lekki Store Customers", t: "Same question as Ada", x: 56, y: 82, r: 3 },
  { c: "telegram", from: "Dev Syndicate", t: "ok", x: 74, y: 4, r: -5 },
  { c: "whatsapp", from: "Wholesale Buyers", t: "Sent the price list", x: 4, y: 90, r: 1 },
];

const prompts = ["What did the wholesale buyers ask this week?", "Anything urgent in #support?", "Summarize Dev Syndicate since Monday"];

export function Clarity() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 1024px)" }, (ctx) => {
        const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean };
        if (!motion) return;
        splitHeadings(root.current!);
        gsap.from(".clar-body, .clar-prompt", {
          y: 16,
          autoAlpha: 0,
          duration: 0.8,
          stagger: 0.08,
          scrollTrigger: { trigger: ".clar-body", start: "top 85%", once: true },
        });

        if (!desktop) {
          const tl = gsap.timeline({ scrollTrigger: { trigger: ".answer", start: "top 80%", once: true } });
          tl.from(".answer", { clipPath: "inset(12% 8% 12% 8% round 24px)", duration: 1 })
            .from(".ans-urgent", { x: -14, autoAlpha: 0, stagger: 0.1, duration: 0.6 }, 0.3)
            .from(".ans-ping", { scaleY: 0, stagger: 0.1, duration: 0.5 }, 0.6)
            .from(".ans-fyi", { y: 8, autoAlpha: 0, stagger: 0.07, duration: 0.5 }, 0.6);
          return;
        }

        // Pinned scrub: the wall of chats collapses into one answer.
        gsap.set(".answer", { autoAlpha: 0, scale: 0.94, y: 30 });
        gsap.set([".ans-urgent", ".ans-fyi", ".ans-label"], { autoAlpha: 0, y: 10 });
        gsap.set(".ans-ping", { scaleY: 0 });
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: ".clar-stage-wrap",
            start: "top top",
            end: "+=140%",
            pin: true,
            scrub: 0.9,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });
        tl.from(".noise", { y: 40, autoAlpha: 0, stagger: 0.03, duration: 0.25, ease: "power2.out" }, 0)
          .to(".noise", {
            x: (i, el: HTMLElement) => {
              const stage = el.parentElement!.getBoundingClientRect();
              const r = el.getBoundingClientRect();
              return stage.left + stage.width / 2 - (r.left + r.width / 2);
            },
            y: (i, el: HTMLElement) => {
              const stage = el.parentElement!.getBoundingClientRect();
              const r = el.getBoundingClientRect();
              return stage.top + stage.height / 2 - (r.top + r.height / 2);
            },
            rotate: 0,
            scale: 0.4,
            autoAlpha: 0,
            stagger: { each: 0.025, from: "random" },
            duration: 0.45,
            ease: "power3.in",
          }, 0.45)
          .to(".answer", { autoAlpha: 1, scale: 1, y: 0, duration: 0.35, ease: "power3.out" }, 0.82)
          .to(".ans-label", { autoAlpha: 1, y: 0, stagger: 0.12, duration: 0.2 }, 1.0)
          .to(".ans-urgent", { autoAlpha: 1, y: 0, stagger: 0.08, duration: 0.25 }, 1.02)
          .to(".ans-ping", { scaleY: 1, stagger: 0.08, duration: 0.2 }, 1.18)
          .to(".ans-fyi", { autoAlpha: 1, y: 0, stagger: 0.06, duration: 0.2 }, 1.15)
          .to({}, { duration: 0.25 }); // hold the answer before release
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} data-section className="relative">
      <div className="clar-stage-wrap lg:h-[100svh] flex items-center py-24 lg:py-0">
        <Container className="w-full grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          <div className="lg:col-span-5">
            <Display className="text-[clamp(2.3rem,3.7vw,3.6rem)]">Know what happened without reading every chat.</Display>
            <p className="clar-body mt-6 text-[17px] leading-relaxed text-ink-600 max-w-[46ch]">
              Ask in plain English. RelayFlow reads the recent messages in every connected group, channel and inbox, then answers with the parts that need you.
            </p>
            <ul className="mt-8 space-y-2.5">
              {prompts.map((q) => (
                <li key={q} className="clar-prompt flex items-center gap-3 text-[15px] text-ink-700">
                  <span className="h-px w-5 bg-signal" />“{q}”
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-7 relative">
            {/* Noise wall (desktop only): collapses into the answer card. */}
            <div className="hidden lg:block absolute inset-[-6%] z-0" aria-hidden>
              {noise.map((n, i) => (
                <div key={i} className="noise absolute" style={{ left: `${n.x}%`, top: `${n.y}%`, transform: `rotate(${n.r}deg)` }}>
                  <ChatBubble channel={n.c} from={n.from} text={n.t} className="!shadow-sm" />
                </div>
              ))}
            </div>
            <div className="relative z-10">
              <AnswerVisual />
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}
