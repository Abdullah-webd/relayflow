import { useRef } from "react";
import { gsap, useGSAP } from "../../lib/gsap";
import { Container } from "./ui";

const lines = ["Run the shop.", "RelayFlow watches", "the chats."];

export function ImageBand() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add({ motion: "(prefers-reduced-motion: no-preference)", desktop: "(min-width: 1024px)" }, (ctx) => {
        const { motion, desktop } = ctx.conditions as { motion: boolean; desktop: boolean };
        if (!motion) return;

        if (!desktop) {
          const tl = gsap.timeline({ scrollTrigger: { trigger: ".band-frame", start: "top 85%", once: true } });
          tl.from(".band-line > span", { yPercent: 110, stagger: 0.1, duration: 1 })
            .fromTo(".band-frame", { clipPath: "inset(10% 10% 10% 10% round 24px)" }, { clipPath: "inset(0% 0% 0% 0% round 20px)", duration: 1.2 }, 0.1)
            .fromTo(".band-img", { scale: 1.2 }, { scale: 1, duration: 1.4 }, 0.1);
          return;
        }

        // Keyhole → full-bleed while pinned, then the line rises onto the empty wall.
        const tl = gsap.timeline({
          scrollTrigger: { trigger: ".band-pin", start: "top top", end: "+=110%", pin: true, pinType: "transform", scrub: 0.8, anticipatePin: 1 },
        });
        tl.fromTo(".band-frame", { clipPath: "inset(16% 26% 16% 26% round 28px)" }, { clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "none", duration: 1 })
          .fromTo(".band-img", { scale: 1.3 }, { scale: 1, ease: "none", duration: 1 }, 0)
          .from(".band-line > span", { yPercent: 110, stagger: 0.12, duration: 0.45, ease: "power3.out" }, 0.7)
          .to({}, { duration: 0.3 });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} data-section aria-label="Built for businesses that run on chat" className="relative">
      <div className="band-pin relative lg:h-[100svh] overflow-hidden">
      {/* Small screens: copy above the photo */}
      <Container className="lg:hidden pt-8 pb-8">
        <p className="font-display font-semibold text-navy text-[clamp(2.2rem,9vw,3.5rem)] leading-[0.98] tracking-[-0.035em]">
          {lines.map((l) => (
            <span key={l} className="band-line block overflow-clip pb-[0.05em]">
              <span className="block">{l}</span>
            </span>
          ))}
        </p>
      </Container>
      <div className="px-5 sm:px-6 lg:px-0 lg:absolute lg:inset-0">
        <div className="band-frame relative h-full overflow-hidden rounded-[20px] lg:rounded-none aspect-[4/3] sm:aspect-[16/9] lg:aspect-auto">
          <img
            src="/images/shop-2400.webp"
            srcSet="/images/shop-1200.webp 1200w, /images/shop-2400.webp 2400w"
            sizes="100vw"
            width={2400}
            height={1344}
            loading="lazy"
            decoding="async"
            alt="A shop owner in Lagos checks her phone at the counter, cartons stacked beside her."
            className="band-img h-full w-full object-cover object-[70%_50%]"
          />
          <div className="hidden lg:flex absolute inset-0 items-center">
            <Container className="w-full">
              <p className="font-display font-semibold text-navy text-[clamp(3rem,5.6vw,5.75rem)] leading-[0.96] tracking-[-0.04em] max-w-[11ch]">
                {lines.map((l) => (
                  <span key={l} className="band-line block overflow-clip pb-[0.05em]">
                    <span className="block">{l}</span>
                  </span>
                ))}
              </p>
            </Container>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}
