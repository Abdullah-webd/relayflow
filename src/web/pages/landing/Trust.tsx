import { useRef } from "react";
import { ArrowUpRight, Clock, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { gsap, SplitText, useGSAP } from "../../lib/gsap";
import { Container, Display, splitHeadings } from "./ui";

const guarantees = [
  { icon: ShieldCheck, t: "Approval before the agent sends", d: "Messages, broadcasts and scheduled tasks wait for your OK. Auto-replies run only on channels you switch them on for." },
  { icon: KeyRound, t: "Official sign-in for Slack", d: "Connected through OAuth. RelayFlow never sees your Slack password." },
  { icon: Lock, t: "Encrypted credentials", d: "Channel sessions and tokens are encrypted at the field level before they’re stored." },
  { icon: Clock, t: "Only recent context", d: "Channel messages are deleted automatically after 14 days. It never archives your full history." },
];

export function Security() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        splitHeadings(root.current!);
        // The manifesto lights up word by word as it's read (scrubbed).
        SplitText.create(".manifesto", {
          type: "words",
          autoSplit: true,
          onSplit(self) {
            return gsap.fromTo(
              self.words,
              { opacity: 0.16 },
              { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: ".manifesto", start: "top 78%", end: "bottom 50%", scrub: true } },
            );
          },
        });
        gsap.utils.toArray<HTMLElement>(".guarantee").forEach((row) => {
          const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: "top 88%", once: true } });
          tl.from(row.querySelector(".g-rule"), { scaleX: 0, duration: 1, ease: "expo.inOut" })
            .from(row.querySelectorAll(".g-in"), { y: 14, autoAlpha: 0, stagger: 0.08, duration: 0.7 }, 0.25);
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} data-section className="py-24 sm:py-36">
      <Container>
        <Display className="text-[clamp(2.4rem,5vw,4.5rem)] max-w-[13ch]">Built so nothing leaves without you.</Display>
        <p className="manifesto mt-10 sm:mt-14 max-w-[30ch] font-display font-medium text-navy text-[clamp(1.6rem,3.1vw,2.75rem)] leading-[1.18] tracking-[-0.02em]">
          RelayFlow works inside your real conversations, so it’s careful by default: every message, broadcast and scheduled task waits for your OK.
        </p>

        <dl className="mt-16 sm:mt-24 grid md:grid-cols-2 gap-x-12">
          {guarantees.map((g) => (
            <div key={g.t} className="guarantee relative py-7">
              <span className="g-rule absolute inset-x-0 top-0 h-px bg-line origin-left" aria-hidden />
              <div className="flex gap-4">
                <g.icon size={20} strokeWidth={1.75} className="g-in mt-0.5 shrink-0 text-signal" />
                <div>
                  <dt className="g-in text-[16px] font-medium text-ink-900">{g.t}</dt>
                  <dd className="g-in mt-1.5 text-[15.5px] leading-relaxed text-ink-600 max-w-[46ch]">{g.d}</dd>
                </div>
              </div>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

// Real customers from the original RelayFlow site (customer-reported outcomes).
const customers = [
  { name: "Graph", href: "https://graph.finance", logo: "/graph-logo.jpg", context: "Global payments · Techstars ’23", result: "30×", outcome: "more productivity and revenue" },
  { name: "ScalePad", context: "The MSP operating platform", result: "20×", outcome: "more outreach and productivity" },
];

export function Customers() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        splitHeadings(root.current!);
        gsap.utils.toArray<HTMLElement>(".cust").forEach((c) => {
          const tl = gsap.timeline({ scrollTrigger: { trigger: c, start: "top 85%", once: true } });
          tl.from(c.querySelector(".cust-rule"), { scaleX: 0, duration: 1.1, ease: "expo.inOut" })
            .from(c.querySelectorAll(".cust-line > span"), { yPercent: 110, stagger: 0.08, duration: 1 }, 0.2)
            .from(c.querySelectorAll(".cust-meta"), { autoAlpha: 0, y: 8, duration: 0.6 }, 0.6);
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} data-section className="py-24 sm:py-32">
      <Container>
        <Display className="text-[clamp(2.2rem,4.2vw,3.75rem)]">What changed for our customers.</Display>
        <div className="mt-12 sm:mt-16 space-y-4">
          {customers.map((c) => {
            const Wrap = c.href ? "a" : "div";
            return (
              <Wrap
                key={c.name}
                {...(c.href ? { href: c.href, target: "_blank", rel: "noopener noreferrer" } : {})}
                className="cust group relative block pt-8 pb-10"
              >
                <span className="cust-rule absolute inset-x-0 top-0 h-px bg-navy/80 origin-left" aria-hidden />
                <div className="grid lg:grid-cols-12 gap-6 items-end">
                  <div className="lg:col-span-3 cust-meta flex items-center gap-3">
                    {c.logo ? (
                      <img src={c.logo} alt={c.name} className="h-8 w-auto object-contain" />
                    ) : (
                      <span className="text-[24px] font-semibold tracking-[-0.03em] text-ink-900">{c.name}</span>
                    )}
                    {c.href && <ArrowUpRight size={18} className="text-ink-400 transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink-900" />}
                  </div>
                  <p className="lg:col-span-9 font-display font-semibold text-navy text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.95] tracking-[-0.04em]">
                    <span className="cust-line block overflow-clip pb-[0.05em]">
                      <span className="block">
                        <span className="tabular-nums">{c.result}</span> {c.outcome}
                      </span>
                    </span>
                  </p>
                </div>
                <div className="cust-meta mt-6 flex flex-wrap justify-between gap-3 text-[13px] text-ink-500 lg:pl-[25%]">
                  <span>{c.context}</span>
                  <span>Customer-reported</span>
                </div>
              </Wrap>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
