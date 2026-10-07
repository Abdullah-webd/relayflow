import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { Logo } from "../../components/Logo";
import { gsap, ScrollTrigger, useGSAP } from "../../lib/gsap";
import { Container, RollLabel, TransitionLink } from "./ui";

const navLinks = [
  { label: "Product", href: "#product" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function Header({ loggedIn }: { loggedIn: boolean }) {
  const root = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Hide while reading down, return on the first scroll up.
        const show = gsap.quickTo(root.current!, "yPercent", { duration: 0.45, ease: "expo.out" });
        ScrollTrigger.create({
          start: 0,
          end: "max",
          onUpdate: (self) => {
            if (menuOpen) return;
            show(self.direction === 1 && self.scroll() > 240 ? -100 : 0);
          },
        });
      });
      ScrollTrigger.create({
        start: 8,
        end: "max",
        toggleClass: { targets: root.current!, className: "is-scrolled" },
      });
    },
    { scope: root, dependencies: [menuOpen], revertOnUpdate: true },
  );

  return (
    <header ref={root} className="group/h fixed inset-x-0 top-0 z-50 bg-white border-b border-transparent [&.is-scrolled]:border-line transition-[border-color] duration-200">
      <Container className="h-16 flex items-center justify-between">
        <Link to="/" aria-label="RelayFlow home" className="shrink-0">
          <Logo byline />
        </Link>

        <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="px-3 py-2 text-[14.5px] text-ink-600 hover:text-ink-900">
              <span className="u-link pb-0.5">{l.label}</span>
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {loggedIn ? (
            <TransitionLink to="/app" className="btn-primary h-9 px-4">
              <RollLabel>Dashboard</RollLabel>
            </TransitionLink>
          ) : (
            <>
              <TransitionLink to="/login" className="text-[14.5px] font-medium text-ink-700 hover:text-ink-900 px-3 py-2">
                <span className="u-link pb-0.5">Sign in</span>
              </TransitionLink>
              <TransitionLink to="/signup" className="btn-primary h-9 px-4">
                <RollLabel>Start free trial</RollLabel>
              </TransitionLink>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          className="md:hidden grid place-items-center h-11 w-11 -mr-2 rounded-lg text-ink-700 active:scale-95 transition-transform"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={menuOpen ? "x" : "m"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }}>
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </motion.span>
          </AnimatePresence>
        </button>
      </Container>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            className="md:hidden bg-white border-b border-line overflow-hidden"
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] } }}
            transition={{ duration: 0.34, ease: [0.23, 1, 0.32, 1] }}
          >
            <nav aria-label="Mobile" className="px-5 pb-5 pt-2 flex flex-col gap-1">
              {navLinks.map((l, i) => (
                <motion.a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.05 + i * 0.04, duration: 0.3 }}
                  className="font-display text-[26px] font-semibold text-navy tracking-[-0.02em] px-1 py-2"
                >
                  {l.label}
                </motion.a>
              ))}
              <div className="h-px bg-line my-3" />
              {loggedIn ? (
                <TransitionLink to="/app" onClick={() => setMenuOpen(false)} className="btn-primary h-12 w-full text-[15px]">
                  Go to dashboard
                </TransitionLink>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <TransitionLink to="/login" onClick={() => setMenuOpen(false)} className="btn-ghost h-12 text-[15px]">
                    Sign in
                  </TransitionLink>
                  <TransitionLink to="/signup" onClick={() => setMenuOpen(false)} className="btn-primary h-12 text-[15px]">
                    Start free trial
                  </TransitionLink>
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
