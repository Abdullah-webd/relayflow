import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Sparkles, ShieldCheck, Loader2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";

interface PlanView {
  key: "starter" | "growth";
  name: string;
  blurb: string;
  priceUsd: number;
  credits: number;
  features: string[];
  popular: boolean;
}

export default function Pricing() {
  const { user, loading, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [trialDays, setTrialDays] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [finishing, setFinishing] = useState(false);

  const status = params.get("status");
  const sessionId = params.get("session_id");

  useEffect(() => {
    api<{ plans: PlanView[]; trialDays: number }>("/billing/plans")
      .then((d) => {
        setPlans(d.plans);
        setTrialDays(d.trialDays);
      })
      .catch(() => undefined);
  }, []);

  // Coming back from a successful Stripe Checkout: confirm the subscription, then enter the app.
  useEffect(() => {
    if (status === "success" && sessionId && !finishing) {
      setFinishing(true);
      (async () => {
        try {
          await api("/billing/confirm", { method: "POST", body: JSON.stringify({ sessionId }) });
          await refresh();
          nav("/app", { replace: true });
        } catch {
          setError("We couldn't confirm your subscription. If you were charged, contact support — otherwise try again.");
          setFinishing(false);
          setParams({}, { replace: true });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionId]);

  async function choose(planKey: string) {
    setError("");
    if (!user) {
      nav(`/signup?plan=${planKey}`);
      return;
    }
    setBusy(planKey);
    try {
      const { url } = await api<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: planKey }),
      });
      window.location.href = url;
    } catch (e: any) {
      setError(e?.data?.detail || e?.message || "Could not start checkout. Please try again.");
      setBusy(null);
    }
  }

  if (finishing) {
    return (
      <div className="min-h-full grid place-items-center bg-white text-ink-600">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-brand-600" size={28} />
          <p className="text-[15px]">Finishing setup…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-white text-ink-800">
      <header className="border-b border-line">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link to="/">
            <Logo />
          </Link>
          <div className="flex items-center gap-3 text-[15px]">
            {user ? (
              <button onClick={() => logout().then(() => nav("/login"))} className="font-semibold text-ink-600 hover:text-ink-900 px-3 py-2">
                Sign out
              </button>
            ) : (
              <Link to="/login" className="font-semibold text-ink-600 hover:text-ink-900 px-3 py-2">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-14">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold px-3 py-1.5">
            <Sparkles size={15} /> Start with a {trialDays}-day free trial
          </span>
          <h1 className="mt-5 text-[34px] sm:text-[42px] leading-tight font-extrabold tracking-tight text-ink-900">
            {user ? "Pick a plan to activate your account" : "Simple, usage-based pricing"}
          </h1>
          <p className="mt-4 text-lg text-ink-600">
            Your card isn't charged during the free trial, and you can cancel anytime. A credit is one AI action.
          </p>
        </div>

        {status === "cancel" && (
          <div className="mt-8 max-w-xl mx-auto rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-[15px]">
            Checkout was canceled — you can pick a plan whenever you're ready.
          </div>
        )}
        {error && (
          <div className="mt-8 max-w-xl mx-auto rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-[15px]">{error}</div>
        )}

        <div className="mt-12 grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {plans.map((p) => (
            <div
              key={p.key}
              className={`relative card p-7 flex flex-col ${p.popular ? "ring-2 ring-brand-500 shadow-pop" : ""}`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 text-white text-xs font-bold px-3 py-1">
                  Most popular
                </span>
              )}
              <h2 className="text-xl font-bold text-ink-900">{p.name}</h2>
              <p className="mt-1 text-ink-500 text-[15px]">{p.blurb}</p>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-ink-900">${p.priceUsd}</span>
                <span className="text-ink-500">/month</span>
              </div>
              <ul className="mt-6 space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[15px] text-ink-700">
                    <Check size={18} className="text-brand-600 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => choose(p.key)}
                disabled={busy === p.key}
                className={`mt-7 h-12 text-base ${p.popular ? "btn-primary" : "btn-ghost"}`}
              >
                {busy === p.key ? <Loader2 className="animate-spin" size={18} /> : `Start ${trialDays}-day free trial`}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-ink-500">
          <ShieldCheck size={16} className="text-emerald-600" />
          Secure checkout by Stripe · Cancel anytime · No charge during the trial
        </div>
      </main>
    </div>
  );
}
