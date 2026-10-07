import { useRef, type ReactNode } from "react";
import type { Channel } from "../../components/ChannelMark";
import { gsap, useGSAP } from "../../lib/gsap";
import { ChatBubble, Container, ProductWindow } from "./ui";

// Real-sounding inbound messages: the material that converges into one place.
const bubbles: { channel: Channel; from: string; text: string; pos: string }[] = [
  { channel: "whatsapp", from: "Lekki Store Customers · Ada", text: "Is today’s delivery to Lekki still on?", pos: "left-[64%] top-[27%]" },
  { channel: "slack", from: "#sales · Priya Nair", text: "Can we move Thursday’s supplier call to Friday?", pos: "left-[75%] top-[36%]" },
  { channel: "telegram", from: "Dev Syndicate · Amara", text: "v2.3 release notes are up", pos: "left-[79%] top-[17%]" },
  { channel: "whatsapp", from: "Wholesale Buyers · Chidi Okafor", text: "Quote for 50 cartons before 5pm?", pos: "left-[58%] top-[50%]" },
  { channel: "slack", from: "#support · Daniel Ruiz", text: "Any update on my refund?", pos: "left-[79%] top-[56%]" },
  { channel: "whatsapp", from: "Lekki Store Customers · Tunde", text: "Order #4821 hasn’t arrived", pos: "left-[64%] top-[66%]" },
];

export function Hero({ cta, secondary, note }: { cta: ReactNode; secondary?: ReactNode; note?: ReactNode }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 1024px)" }, (ctx) => {
        const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean };
        if (!motion) return;

        // ---- Focal sequence (≤ 1.4s). Headline never sits at opacity 0: it rises inside masks.
        const intro = gsap.timeline({ defaults: { ease: "expo.out" } });
        intro
          .from(".hero-line > span", { yPercent: 108, duration: 1.1, stagger: 0.09 })
          .from(".hero-sub", { y: 18, autoAlpha: 0, duration: 0.8 }, 0.35)
          .from(".hero-cta > *", { y: 14, autoAlpha: 0, duration: 0.7, stagger: 0.06 }, 0.45)
          .from(".hero-window", { y: 80, autoAlpha: 0, duration: 1.2 }, 0.3);

        // Bubbles arrive from the edges, channel by channel, then breathe.
        const bubs = gsap.utils.toArray<HTMLElement>(".hero-bubble");
        bubs.forEach((b, i) => {
          const fromRight = i % 2 === 0;
          intro.from(b, { x: fromRight ? 120 : 60, y: 24, autoAlpha: 0, scale: 0.92, duration: 0.9 }, 0.55 + i * 0.08);
          gsap.to(b.querySelector(".hero-bubble-inner"), {
            y: i % 2 ? 7 : -7,
            duration: 2.6 + (i % 3) * 0.5,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: 1.4 + i * 0.15,
          });
        });

        if (!desktop) {
          intro.from(".pw-step", { y: 10, autoAlpha: 0, duration: 0.6, stagger: 0.12 }, 0.9);
          return;
        }

        // ---- Set-piece: the window rises over the sticky headline; every bubble is pulled into it,
        // then the conversation fills in. Scrubbed to scroll.
        gsap.set(".pw-step", { autoAlpha: 0, y: 12 });
        const win = root.current!.querySelector<HTMLElement>(".hero-window")!;
        const tl = gsap.timeline({
          scrollTrigger: { trigger: root.current, start: "top top", end: "+=85%", scrub: 0.8, invalidateOnRefresh: true },
        });
        tl.to(".hero-copy", { yPercent: -14, autoAlpha: 0, ease: "power1.in", duration: 0.7 }, 0)
          .fromTo(win, { scale: 0.94 }, { scale: 1, ease: "none", duration: 1 }, 0);
        bubs.forEach((b, i) => {
          tl.to(
            b,
            {
              x: () => {
                const r = b.getBoundingClientRect();
                return window.innerWidth / 2 - (r.left + r.width / 2);
              },
              y: () => {
                const r = b.getBoundingClientRect();
                return window.innerHeight * 0.92 - (r.top + r.height / 2);
              },
              scale: 0.35,
              autoAlpha: 0,
              ease: "power2.in",
              duration: 0.55,
            },
            0.05 + i * 0.05,
          );
        });
        tl.to(".pw-step", { autoAlpha: 1, y: 0, stagger: 0.07, ease: "power2.out", duration: 0.22 }, 0.28);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="product" data-section className="relative">
      {/* Sticky layer: headline + bubbles. The window scrolls up over it. */}
      <div className="lg:sticky lg:top-0 lg:h-[100svh]">
        <Container data-verify-ignore className="hero-copy relative pt-12 sm:pt-20 lg:pt-[13svh]">
          <h1
            className="font-display font-semibold text-navy tracking-[-0.045em] leading-[0.94] text-[clamp(2.9rem,min(7.4vw,11.5svh),7.25rem)]"
            aria-label="Every business chat, answered from one place."
          >
            {["Every business chat,", "answered from", "one place."].map((line) => (
              <span key={line} className="hero-line block overflow-clip pb-[0.06em]" aria-hidden>
                <span className="block">{line}</span>
              </span>
            ))}
          </h1>
          <p className="hero-sub mt-6 sm:mt-8 max-w-[48ch] text-[17px] sm:text-[19px] leading-relaxed text-ink-600">
            RelayFlow reads your WhatsApp, Telegram and Slack, tells you what needs attention, and drafts replies you approve before anything is sent.
          </p>
          <div className="hero-cta mt-8 flex flex-col sm:flex-row sm:items-center gap-3">
            {cta}
            {secondary}
          </div>
          {note && <div className="hero-cta mt-5">{note}</div>}

          {/* Small screens: three bubbles in a stack, no convergence. */}
          <div className="lg:hidden mt-10 flex flex-col gap-2.5" aria-hidden>
            {bubbles.slice(0, 3).map((b, i) => (
              <div key={b.from} className={`hero-bubble ${i % 2 ? "self-end" : ""}`}>
                <div className="hero-bubble-inner">
                  <ChatBubble channel={b.channel} from={b.from} text={b.text} />
                </div>
              </div>
            ))}
          </div>
        </Container>

        <div className="hidden lg:block absolute inset-0 pointer-events-none" aria-hidden>
          {bubbles.map((b) => (
            <div key={b.from} className={`hero-bubble absolute ${b.pos}`}>
              <div className="hero-bubble-inner">
                <ChatBubble channel={b.channel} from={b.from} text={b.text} className="max-w-[260px]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 mt-14 lg:-mt-[24svh] pb-24 sm:pb-32">
        <Container>
          <div className="hero-window origin-top">
            <ProductWindow />
          </div>
        </Container>
      </div>
    </section>
  );
}
