import { useEffect, type ReactNode } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import { gsap, ScrollTrigger } from "../lib/gsap";

// Inside ReactLenis so the instance exists: GSAP's ticker drives Lenis, Lenis drives ScrollTrigger.
function LenisGsapBridge() {
  const lenis = useLenis(ScrollTrigger.update);
  useEffect(() => {
    if (!lenis) return;
    const update = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => gsap.ticker.remove(update);
  }, [lenis]);
  return null;
}

/** Smooth scrolling for marketing pages only (the app keeps native scrolling). */
export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={{ autoRaf: false, anchors: { offset: -72 }, lerp: 0.1, stopInertiaOnNavigate: true }}>
      <LenisGsapBridge />
      {children}
    </ReactLenis>
  );
}
