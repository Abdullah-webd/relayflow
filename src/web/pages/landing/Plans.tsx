import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Plus } from "lucide-react";
import { PRICES } from "../../lib/pricing";
import { FAQS } from "../../../shared/seo";
import { gsap, useGSAP } from "../../lib/gsap";
import { Container, Display, RollLabel, splitHeadings, TransitionLink } from "./ui";

const EASE = [0.23, 1, 0.32, 1] as const;

// Mirrors src/server/billing/plans.ts (the server is the source of truth for prices).
const landingPlans = [
  {
    name: "Starter",
    price: PRICES.starter,
    blurb: "Run your channels from one AI chat",
    popular: false,
    features: ["WhatsApp, Telegram and Slack", "Ask, summarize and search your chats", "Send to one group or all channels", "Approve-before-send on every message", "Up to 5 scheduled tasks", "Up to 3 monitors"],
  },
  {
    name: "Pro",
    price: PRICES.pro,
    blurb: "Smarter AI that also replies for you",
    popular: true,
    features: ["Everything in Starter", "Smarter AI model for more accurate answers", "Auto-replies from your knowledge base", "Unlimited scheduled tasks", "Unlimited monitors"],
  },
];

export function Pricing({ loggedIn }: { loggedIn: boolean }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        splitHeadings(root.current!);
        gsap.from(".price-lead", { y: 16, autoAlpha: 0, duration: 0.8, scrollTrigger: { trigger: ".price-lead", start: "top 88%", once: true } });
        gsap.utils.toArray<HTMLElement>(".plan").forEach((p, i) => {
          const tl = gsap.timeline({ scrollTrigger: { trigger: p, start: "top 82%", once: true }, delay: i * 0.12 });
          tl.fromTo(p, { clipPath: "inset(8% 0% 0% 0% round 28px)", y: 40 }, { clipPath: "inset(0% 0% 0% 0% round 28px)", y: 0, duration: 1.1 })
            .from(p.querySelector(".plan-price"), { yPercent: 100, duration: 0.9 }, 0.2)
            .from(p.querySelectorAll(".plan-check"), { scale: 0.6, autoAlpha: 0, stagger: 0.06, duration: 0.4, ease: "back.out(2)" }, 0.45);
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="pricing" data-section className="py-24 sm:py-32">
      <Container>
        <Display className="text-[clamp(2.4rem,5vw,4.5rem)]">Simple plans. Start free.</Display>
        <p className="price-lead mt-6 text-[17px] leading-relaxed text-ink-600 max-w-[56ch]">
          Try every Pro feature free for 1 day, no credit card required. Then choose Starter at ${PRICES.starter} or Pro at ${PRICES.pro} a month. No usage credits.
        </p>
        <div className="mt-12 sm:mt-16 grid md:grid-cols-2 gap-5 max-w-4xl">
          {landingPlans.map((p) => (
            <div key={p.name} className={`plan flex flex-col rounded-[28px] bg-white p-7 sm:p-9 ${p.popular ? "ring-2 ring-brand-600 shadow-frame" : "border border-line"}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[22px] font-semibold text-navy">{p.name}</h3>
                {p.popular && <span className="rounded-full bg-brand-600 text-white px-2.5 h-6 inline-flex items-center text-[12px] font-medium">Most popular</span>}
              </div>
              <p className="mt-1 text-[14.5px] text-ink-500">{p.blurb}</p>
              <div className="mt-7 flex items-baseline gap-1.5 overflow-clip">
                <span className="plan-price block font-display text-[64px] leading-none font-semibold text-navy tracking-[-0.04em] tabular-nums">${p.price}</span>
                <span className="text-[15px] text-ink-500">/month</span>
              </div>
              <ul className="mt-8 space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14.5px] text-ink-700">
                    <Check size={16} strokeWidth={2.25} className="plan-check mt-0.5 shrink-0 text-brand-600" />
                    {f}
                  </li>
                ))}
              </ul>
              <TransitionLink to={loggedIn ? "/pricing" : "/signup"} className={`mt-9 h-12 w-full text-[15px] ${p.popular ? "btn-primary" : "btn-ghost"}`}>
                <RollLabel>{loggedIn ? "See your plan" : "Start free trial"}</RollLabel>
              </TransitionLink>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[13px] text-ink-500">No credit card required for the trial · Switch plans or cancel anytime</p>
      </Container>
    </section>
  );
}

export function Faq() {
  const root = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(0);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        splitHeadings(root.current!);
        gsap.from(".faq-row", { y: 18, autoAlpha: 0, stagger: 0.06, duration: 0.7, scrollTrigger: { trigger: ".faq-list", start: "top 85%", once: true } });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="faq" data-section className="py-24 sm:py-32">
      <Container className="grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <Display className="text-[clamp(2.4rem,4.4vw,4rem)]">Questions, answered.</Display>
          </div>
        </div>
        <div className="faq-list lg:col-span-7 lg:col-start-6 border-b border-line">
          {FAQS.map((f, n) => {
            const isOpen = open === n;
            return (
              <div key={f.q} className="faq-row border-t border-line">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : n)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-${n}`}
                  className="group w-full flex items-center justify-between gap-6 py-6 text-left"
                >
                  <span className="text-[17px] font-medium text-ink-900 transition-colors group-hover:text-brand-700">{f.q}</span>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ type: "spring", duration: 0.35, bounce: 0 }} className="shrink-0 text-ink-400">
                    <Plus size={20} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-${n}`}
                      key="a"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: EASE } }}
                      transition={{ duration: 0.32, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 pr-10 text-[15.5px] leading-relaxed text-ink-600">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
