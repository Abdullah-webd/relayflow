import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Logo } from "../../components/Logo";
import { ChannelMark, CHANNEL_COLOR, type Channel } from "../../components/ChannelMark";
import { gsap, useGSAP } from "../../lib/gsap";
import { Container, Display, splitHeadings } from "./ui";

const orbit: { c: Channel; x: string; y: string }[] = [
  { c: "whatsapp", x: "-150%", y: "-40%" },
  { c: "telegram", x: "150%", y: "-70%" },
  { c: "slack", x: "40%", y: "120%" },
];

export function FinalCta({ cta, secondary }: { cta: ReactNode; secondary?: ReactNode }) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        splitHeadings(root.current!, "top 80%");
        // The three channels fly into the RelayFlow mark: the whole story in one gesture.
        gsap.set(".orb", { translate: "none" }); // GSAP owns the offset now (CSS translate is the reduced-motion layout)
        const tl = gsap.timeline({ scrollTrigger: { trigger: ".converge", start: "top 85%", end: "center 55%", scrub: 0.8 } });
        orbit.forEach((o, i) => {
          tl.fromTo(`.orb-${i}`, { xPercent: parseFloat(o.x), yPercent: parseFloat(o.y), scale: 1 }, { xPercent: 0, yPercent: 0, scale: 0.6, autoAlpha: 0, ease: "power2.in", duration: 1 }, i * 0.08);
        });
        tl.fromTo(".orb-core", { scale: 0.85 }, { scale: 1, ease: "back.out(3)", duration: 0.4 }, 0.85)
          .fromTo(".orb-ring", { scale: 0.6, autoAlpha: 0.6 }, { scale: 1.9, autoAlpha: 0, ease: "power2.out", duration: 0.5 }, 0.9);
        gsap.from(".final-cta > *", { y: 16, autoAlpha: 0, stagger: 0.08, duration: 0.8, scrollTrigger: { trigger: ".final-cta", start: "top 92%", once: true } });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} data-section className="py-28 sm:py-40 overflow-x-clip">
      <Container className="flex flex-col items-center text-center">
        <div className="converge relative grid place-items-center h-28 w-28 mb-12" aria-hidden>
          {orbit.map((o, i) => (
            <span key={o.c} className={`orb orb-${i} absolute grid place-items-center h-14 w-14 rounded-2xl border border-line bg-white shadow-md`} style={{ color: CHANNEL_COLOR[o.c], translate: `${o.x} ${o.y}` }}>
              <ChannelMark channel={o.c} size={24} />
            </span>
          ))}
          <span className="orb-ring absolute inset-0 rounded-full border-2 border-signal opacity-0" />
          <span className="orb-core relative grid place-items-center h-24 w-24 rounded-[28px] bg-white shadow-frame">
            <Logo size={52} showText={false} />
          </span>
        </div>
        <Display className="text-[clamp(2.8rem,7.4vw,7rem)] max-w-[12ch]">Put one agent on every chat.</Display>
        <p className="final-cta-lead mt-6 text-[17px] sm:text-[19px] text-ink-600">Connect your first channel in about a minute. No credit card required.</p>
        <div className="final-cta mt-10 flex flex-col sm:flex-row justify-center gap-3">
          {cta}
          {secondary}
        </div>
      </Container>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-line">
      <Container className="py-14">
        <div className="flex flex-col md:flex-row md:justify-between gap-10">
          <div className="max-w-xs">
            <Logo byline />
            <p className="mt-4 text-[14px] leading-relaxed text-ink-500">One AI agent across WhatsApp, Telegram and Slack.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-10 sm:gap-16 text-[14px] text-ink-600">
            <div>
              <h3 className="text-[13px] font-medium text-ink-900">Product</h3>
              <ul className="mt-4 space-y-2.5">
                <li><a href="#features" className="u-link hover:text-ink-900">Features</a></li>
                <li><a href="#how" className="u-link hover:text-ink-900">How it works</a></li>
                <li><a href="#pricing" className="u-link hover:text-ink-900">Pricing</a></li>
                <li><a href="#faq" className="u-link hover:text-ink-900">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-medium text-ink-900">Account</h3>
              <ul className="mt-4 space-y-2.5">
                <li><Link to="/login" className="u-link hover:text-ink-900">Sign in</Link></li>
                <li><Link to="/signup" className="u-link hover:text-ink-900">Start free trial</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-medium text-ink-900">Legal</h3>
              <ul className="mt-4 space-y-2.5">
                <li><Link to="/privacy" className="u-link hover:text-ink-900">Privacy Policy</Link></li>
                <li><Link to="/terms" className="u-link hover:text-ink-900">Terms of Service</Link></li>
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
  );
}
