import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, ShieldCheck, Loader2, CircleAlert, CircleCheck, Info } from "lucide-react";
import { Logo } from "../components/Logo";
import { useAuth, hasActivePlan } from "../lib/auth";
import { api } from "../lib/api";

type PlanKey = "starter" | "pro";

interface PlanView {
  key: PlanKey;
  name: string;
  blurb: string;
  priceUsd: number;
  features: string[];
  popular: boolean;
}

function timeLeft(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 60_000));
  const h = Math.floor(mins / 60);
  return h >= 1 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

export default function Pricing() {
  const { user, loading, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [trialDays, setTrialDays] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const status = params.get("status");
  const sessionId = params.get("session_id");

  useEffect(() => {
    api<{ plans: PlanView[]; trialDays: number }>("/billing/plans")
      .then((d) => {
        setPlans(d.plans);
        setTrialDays(d.trialDays);
      })
      .catch(() => setLoadFailed(true));
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
          setError("We couldn’t confirm your subscription. If you were charged, contact support. Otherwise, try again.");
          setFinishing(false);
          setParams({}, { replace: true });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sessionId]);

  const subscribed = user?.subscriptionStatus === "active";
  const currentPlan: PlanKey | null = subscribed ? (user?.plan === "starter" ? "starter" : "pro") : null;

  async function subscribe(planKey: PlanKey) {
    setError("");
    setNotice("");
    if (!user) {
      nav(`/signup?plan=${planKey}`);
      return;
    }
    setBusy(planKey);
    try {
      const { url } = await api<{ url: string }>("/billing/checkout", { method: "POST", body: JSON.stringify({ plan: planKey }) });
      window.location.href = url;
    } catch (e: any) {
      setError(e?.data?.detail || e?.message || "Couldn’t start checkout. Please try again.");
      setBusy(null);
    }
  }

  async function switchPlan(planKey: PlanKey) {
    setError("");
    setNotice("");
    setBusy(planKey);
    try {
      await api("/billing/change-plan", { method: "POST", body: JSON.stringify({ plan: planKey }) });
      await refresh();
      setNotice(
        planKey === "pro"
          ? "You’re on Pro now. The price difference for this month was charged to your card."
          : "You’re on Starter now. The unused part of Pro is credited to your next bill.",
      );
    } catch (e: any) {
      setError(e?.data?.detail || e?.message || "Couldn’t change your plan. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (finishing) {
    return (
      <div className="min-h-full grid place-items-center bg-white text-ink-600">
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <Loader2 className="animate-spin text-ink-400" size={22} />
          <p className="text-[15px]">Activating your subscription…</p>
        </div>
      </div>
    );
  }

  const s = user?.subscriptionStatus;
  const heading = !user
    ? { title: "Simple plans for every team.", body: `Start with a ${trialDays}-day free trial of every Pro feature. No credit card required.` }
    : subscribed
      ? { title: "Your plan", body: "Switch between Starter and Pro anytime. Stripe adjusts the price for the rest of your month automatically." }
      : s === "trialing" && hasActivePlan(user)
        ? { title: "You’re on the free trial.", body: `${timeLeft(user?.trialEndsAt ?? null)} left with every Pro feature. Pick the plan to keep when it ends.` }
        : s === "trial_expired"
          ? { title: "Your free trial has ended.", body: "Choose a plan to keep using RelayFlow. Your channels, chats and settings are saved." }
          : { title: "Choose a plan to use RelayFlow.", body: "Your channels, chats and settings are saved. Pick a plan to pick up where you left off." };

  function cta(p: PlanView) {
    const isBusy = busy === p.key;
    const spinner = (label: string) => (
      <>
        <Loader2 className="animate-spin" size={16} /> {label}
      </>
    );
    const cls = `mt-8 h-11 w-full text-[15px] ${p.popular ? "btn-primary" : "btn-ghost"}`;
    if (!user) {
      return (
        <button onClick={() => subscribe(p.key)} className={cls}>
          Start free trial
        </button>
      );
    }
    if (subscribed) {
      if (currentPlan === p.key) {
        return (
          <div className="mt-8 h-11 w-full rounded-lg border border-line bg-surface text-[14px] font-medium text-ink-600 grid place-items-center">
            Current plan
          </div>
        );
      }
      return (
        <button onClick={() => switchPlan(p.key)} disabled={!!busy} className={cls}>
          {isBusy ? spinner("Switching…") : p.key === "pro" ? "Upgrade to Pro" : "Switch to Starter"}
        </button>
      );
    }
    return (
      <button onClick={() => subscribe(p.key)} disabled={!!busy} className={cls}>
        {isBusy ? spinner("Opening secure checkout…") : `Subscribe to ${p.name}`}
      </button>
    );
  }

  return (
    <div className="min-h-full bg-white text-ink-800 flex flex-col">
      <header className="border-b border-line">
        <div className="mx-auto max-w-container px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" aria-label="RelayFlow home">
            <Logo byline />
          </Link>
          <div className="flex items-center gap-2 text-[14px]">
            {!loading && user ? (
              <>
                <span className="hidden sm:inline text-ink-500 mr-2">{user.email}</span>
                {hasActivePlan(user) && (
                  <Link to="/app" className="btn-ghost h-9 px-3.5">
                    Back to app
                  </Link>
                )}
                <button onClick={() => logout().then(() => nav("/login"))} className="btn-ghost h-9 px-3.5">
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="font-medium text-ink-700 hover:text-ink-900 px-3 py-2 transition-colors">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-container px-5 sm:px-6 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto text-center rf-in">
          <h1 className="text-display-sm sm:text-display-md font-semibold text-ink-900">{heading.title}</h1>
          <p className="mt-4 text-lead text-ink-600">{heading.body}</p>
        </div>

        <div className="mt-10 max-w-4xl mx-auto space-y-3">
          {status === "cancel" && (
            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[14px] text-ink-700" role="status">
              <Info size={16} className="mt-0.5 shrink-0 text-ink-500" />
              Checkout was canceled. Nothing was charged.
            </div>
          )}
          {notice && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-800" role="status">
              <CircleCheck size={16} className="mt-0.5 shrink-0" />
              {notice}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700" role="alert">
              <CircleAlert size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 grid md:grid-cols-2 gap-5 max-w-4xl mx-auto rf-in" style={{ ["--i" as string]: 1 }}>
          {plans.length ? (
            plans.map((p) => (
              <div
                key={p.key}
                className={`relative flex flex-col rounded-3xl bg-white p-7 sm:p-8 ${
                  p.popular ? "border-2 border-brand-600 shadow-md" : "border border-line"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] font-semibold text-ink-900">{p.name}</h2>
                  {p.popular && (
                    <span className="rounded-full bg-brand-600 text-white px-2.5 h-6 inline-flex items-center text-[12px] font-medium">Most popular</span>
                  )}
                </div>
                <p className="mt-1 text-[14px] text-ink-500">{p.blurb}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-display-lg font-semibold text-ink-900 tabular-nums">${p.priceUsd}</span>
                  <span className="text-[15px] text-ink-500">/month</span>
                </div>
                <ul className="mt-7 space-y-3 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[14px] text-ink-700">
                      <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-600" />
                      {f}
                    </li>
                  ))}
                </ul>
                {cta(p)}
              </div>
            ))
          ) : loadFailed ? (
            <div className="md:col-span-2 py-10 text-center rounded-3xl border border-line" role="alert">
              <p className="text-[15px] font-medium text-ink-900">Couldn’t load pricing.</p>
              <p className="mt-1 text-[14px] text-ink-600">Check your connection and try again.</p>
              <button onClick={() => window.location.reload()} className="btn-ghost mt-5 h-9 px-4">
                Try again
              </button>
            </div>
          ) : (
            [0, 1].map((n) => (
              <div key={n} className="rounded-3xl border border-line p-8 animate-pulse" aria-hidden>
                <div className="h-4 w-20 rounded bg-surface" />
                <div className="mt-8 h-12 w-28 rounded bg-surface" />
                <div className="mt-8 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-4 rounded bg-surface" />
                  ))}
                </div>
                <div className="mt-8 h-11 rounded-lg bg-surface" />
              </div>
            ))
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 text-[13px] text-ink-500">
          <ShieldCheck size={14} className="text-ink-400" />
          {!user ? "Free trial includes every Pro feature · No credit card required · Cancel anytime" : "Secure checkout by Stripe · Switch or cancel anytime"}
        </p>
      </main>
    </div>
  );
}
