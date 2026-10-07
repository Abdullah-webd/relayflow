import { useRef } from "react";
import { CircleCheck, QrCode } from "lucide-react";
import { ChannelMark, CHANNEL_COLOR, type Channel } from "../../components/ChannelMark";
import { gsap, useGSAP } from "../../lib/gsap";
import { Container, Display, splitHeadings } from "./ui";

const CHANNELS: Channel[] = ["whatsapp", "telegram", "slack"];
const QUESTION = "What happened on Telegram today?";

const steps = [
  {
    title: "Connect your channels",
    body: "Scan a QR code for WhatsApp, sign in to Telegram, and authorize Slack with its official sign-in.",
    visual: (
      <div className="flex items-center gap-3">
        <span className="grid place-items-center h-12 w-12 rounded-lg border border-line bg-white text-ink-900 shadow-xs">
          <QrCode size={26} strokeWidth={1.5} />
        </span>
        <div className="flex -space-x-1">
          {CHANNELS.map((c) => (
            <span key={c} className="s1-mark grid place-items-center h-8 w-8 rounded-full border-2 border-white bg-surface" style={{ color: CHANNEL_COLOR[c] }}>
              <ChannelMark channel={c} size={14} />
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
      <div className="flex items-center gap-2 h-11 rounded-lg border border-line bg-white px-3 text-[13.5px] text-ink-600 shadow-xs w-full max-w-[300px]">
        <span className="s2-type whitespace-nowrap overflow-hidden" aria-label={QUESTION}>
          {QUESTION}
        </span>
        <span className="ml-auto h-4 w-px bg-ink-900" />
      </div>
    ),
  },
  {
    title: "Approve and send",
    body: "Review the draft and destinations, then send to one group or every channel with a single approval.",
    visual: (
      <div className="flex items-center gap-2.5">
        <span className="s3-btn btn-primary h-9 px-3.5 text-[13px]">Approve and send</span>
        <span className="s3-sent inline-flex items-center gap-1.5 text-[12.5px] text-ink-600">
          <CircleCheck size={14} className="text-brand-600" /> Sent to 3 groups
        </span>
      </div>
    ),
  },
];

export function HowItWorks() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 768px)" }, (ctx) => {
        const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean };
        if (!motion) return;
        splitHeadings(root.current!);

        // Each step's micro-demo, played when the signal reaches it.
        const demos = [
          gsap.timeline({ paused: true }).from(".s1-mark", { x: -14, autoAlpha: 0, stagger: 0.1, duration: 0.5 }),
          gsap.timeline({ paused: true }).fromTo(".s2-type", { width: 0 }, { width: "auto", duration: 1.1, ease: `steps(${QUESTION.length})` }),
          gsap
            .timeline({ paused: true })
            .to(".s3-btn", { scale: 0.95, duration: 0.12, ease: "power2.out" })
            .to(".s3-btn", { scale: 1, duration: 0.25 })
            .from(".s3-sent", { x: -10, autoAlpha: 0, duration: 0.45 }, "<"),
        ];
        gsap.set(".step", { autoAlpha: 0.35 });
        gsap.set(".s2-type", { width: 0 });
        gsap.set(".s3-sent", { autoAlpha: 0 });

        const tl = gsap.timeline({
          scrollTrigger: { trigger: ".steps", start: desktop ? "top 70%" : "top 80%", end: desktop ? "bottom 45%" : "bottom 60%", scrub: 0.6 },
        });
        tl.fromTo(".wire-fill", { scaleX: 0, scaleY: 0 }, { scaleX: 1, scaleY: 1, ease: "none", duration: 1 }, 0);
        gsap.utils.toArray<HTMLElement>(".step").forEach((step, i) => {
          const at = i / (steps.length - 1) * 0.9;
          tl.to(step, { autoAlpha: 1, duration: 0.08 }, at)
            .to(step.querySelector(".node"), { backgroundColor: "rgb(5 115 254)", borderColor: "rgb(5 115 254)", color: "#fff", duration: 0.08 }, at)
            .call(() => demos[i].play(), undefined, at + 0.01);
        });
        if (desktop) tl.fromTo(".packet", { left: "0%" }, { left: "100%", ease: "none", duration: 1 }, 0);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="how" data-section className="py-24 sm:py-32">
      <Container>
        <Display className="text-[clamp(2.4rem,5vw,4.5rem)] max-w-[14ch]">From sign-up to your first answer in minutes.</Display>

        <div className="steps relative mt-16 sm:mt-20">
          {/* The relay wire: horizontal on desktop, vertical on phones. */}
          <div className="absolute left-[15px] top-4 bottom-4 w-px bg-wire md:left-0 md:right-0 md:top-[15px] md:bottom-auto md:h-px md:w-auto" aria-hidden>
            <div className="wire-fill absolute inset-0 bg-signal origin-top md:origin-left" />
            <span className="packet hidden md:block absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-signal shadow-[0_0_0_6px_rgb(var(--signal)/0.15)]" />
          </div>

          <ol className="relative grid gap-12 md:grid-cols-3 md:gap-10">
            {steps.map((s, n) => (
              <li key={s.title} className="step relative list-none pl-12 md:pl-0">
                <span className="node absolute md:static left-0 grid place-items-center h-8 w-8 rounded-full border border-wire bg-white font-mono text-[12px] text-ink-600 tabular-nums">
                  0{n + 1}
                </span>
                <div className="md:mt-8 h-12 flex items-center">{s.visual}</div>
                <h3 className="mt-6 font-display font-semibold text-navy text-[24px] tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-ink-600 max-w-[34ch]">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  );
}
