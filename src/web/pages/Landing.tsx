import { ArrowRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { SmoothScroll } from "../components/SmoothScroll";
import { Header } from "./landing/Header";
import { Hero } from "./landing/Hero";
import { Clarity } from "./landing/Clarity";
import { Capabilities } from "./landing/Capabilities";
import { ImageBand } from "./landing/ImageBand";
import { HowItWorks } from "./landing/HowItWorks";
import { Customers, Security } from "./landing/Trust";
import { Faq, Pricing } from "./landing/Plans";
import { FinalCta, Footer } from "./landing/Closing";
import { RollLabel, TransitionLink } from "./landing/ui";

// Motion-led landing page. Design plan and motion thesis: DESIGN-PLAN.md at the repo root.
export default function Landing() {
  const { user, loading } = useAuth();
  const loggedIn = !!user && !loading; // already signed in → send them to the dashboard

  const primaryCta = loggedIn ? (
    <TransitionLink to="/app" className="btn-primary h-12 px-6 text-[15.5px]">
      <RollLabel>Go to dashboard</RollLabel> <ArrowRight size={16} />
    </TransitionLink>
  ) : (
    <TransitionLink to="/signup" className="btn-primary h-12 px-6 text-[15.5px]">
      <RollLabel>Start free trial</RollLabel>
    </TransitionLink>
  );

  return (
    <SmoothScroll>
      <div className="rf-landing min-h-full bg-white overflow-x-clip">
        <Header loggedIn={loggedIn} />
        <main className="pt-16">
          <Hero
            cta={primaryCta}
            secondary={
              !loggedIn && (
                <a href="#how" className="btn-ghost h-12 px-6 text-[15.5px]">
                  <RollLabel>See how it works</RollLabel>
                </a>
              )
            }
            note={!loggedIn && <p className="text-[13px] text-ink-500">1-day free trial · No credit card required</p>}
          />
          <Clarity />
          <Capabilities />
          <ImageBand />
          <HowItWorks />
          <Security />
          <Customers />
          <Pricing loggedIn={loggedIn} />
          <Faq />
          <FinalCta
            cta={primaryCta}
            secondary={
              !loggedIn && (
                <TransitionLink to="/login" className="btn-ghost h-12 px-6 text-[15.5px]">
                  <RollLabel>Sign in</RollLabel>
                </TransitionLink>
              )
            }
          />
        </main>
        <Footer />
      </div>
    </SmoothScroll>
  );
}
