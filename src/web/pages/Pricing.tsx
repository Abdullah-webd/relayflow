import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, ShieldCheck, Loader2, CircleAlert, Info, ArrowRight } from "lucide-react";
import { Logo } from "../components/Logo";
import { useAuth, hasActivePlan } from "../lib/auth";
import { api } from "../lib/api";
import { PRICE_USD } from "../lib/pricing";

interface PlanView {
  key: "pro";
  name: string;
  blurb: string;
  priceUsd: number;
  features: string[];
  popular: boolean;
}

function hoursLeft(iso: string | null): string {
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
      setError(e?.data?.detail || e?.message || "Couldn’t start checkout. Please try again.");
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

  const plan = plans[0];
  const price = plan?.priceUsd ?? PRICE_USD;

  // Which situation is the visitor in?
  const s = user?.subscriptionStatus;
  const mode: "visitor" | "trialing" | "subscribed" | "expired" | "subscribe" = !user
    ? "visitor"
    : s === "active"
      ? "subscribed"
      : s === "trialing" && hasActivePlan(user)
        ? "trialing"
        : s === "trial_expired"
          ? "expired"
          : "subscribe";

  const copy = {
    visitor: {
      title: "One plan. Everything included.",
      body: `Try everything free for ${trialDays} day. No credit card required. Then $${price} a month if you want to keep going.`,
      steps: [
        { t: "Today", d: `Sign up and your ${trialDays}-day free trial starts. No card needed.` },
        { t: "When the trial ends", d: `Subscribe for $${price}/month to keep going. If you don’t, your account simply pauses. Nothing is charged.` },
        { t: "Anytime", d: "Cancel from Settings whenever you like. No contracts." },
      ],
    },
    trialing: {
      title: "You’re on the free trial.",
      body: `${hoursLeft(user?.trialEndsAt ?? null)} left. Subscribe now to keep access when your trial ends.`,
      steps: [],
    },
    subscribed: {
      title: "You’re subscribed.",
      body: "Thanks for using RelayFlow Pro. Manage your plan and invoices from Settings.",
      steps: [],
    },
    expired: {
      title: "Your free trial has ended.",
      body: "Subscribe to keep using RelayFlow. Your channels, chats and settings are saved and waiting for you.",
      steps: [],
    },
    subscribe: {
      title: "Subscribe to use RelayFlow.",
      body: "Your channels, chats and settings are saved. Subscribe to pick up where you left off.",
      steps: [],
    },
  }[mode];

  const paySteps = [
    { t: "Today", d: `You’re charged $${price} and get full access right away.` },
    { t: "Every month", d: `Renews at $${price}/month until you cancel.` },
    { t: "Anytime", d: "Cancel from Settings whenever you like. No contracts." },
  ];
  const steps = copy.steps.length ? copy.steps : mode === "subscribed" ? [] : paySteps;

  const ctaLabel = mode === "visitor" ? "Start free trial" : `Subscribe · $${price}/month`;

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

      <main className="flex-1 mx-auto w-full max-w-container px-5 sm:px-6 py-16 sm:py-24">
        <div className="grid lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5 rf-in">
            <h1 className="text-display-sm sm:text-display-md font-semibold text-ink-900">{copy.title}</h1>
            <p className="mt-4 text-lead text-ink-600">{copy.body}</p>

            {steps.length > 0 && (
              <dl className="mt-10 space-y-5">
                {steps.map((row) => (
                  <div key={row.t} className="flex gap-4">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
                    <div>
                      <dt className="text-[14px] font-medium text-ink-900">{row.t}</dt>
                      <dd className="mt-0.5 text-[14px] leading-relaxed text-ink-600">{row.d}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="lg:col-span-6 lg:col-start-7 rf-in" style={{ ["--i" as string]: 1 }}>
            {status === "cancel" && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[14px] text-ink-700" role="status">
                <Info size={16} className="mt-0.5 shrink-0 text-ink-500" />
                Checkout was canceled. Nothing was charged.
              </div>
            )}
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700" role="alert">
                <CircleAlert size={16} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="rounded-3xl border border-line bg-white p-7 sm:p-9 shadow-md">
              {plan ? (
                <>
                  <div className="flex items-center justify-between">
                    <h2 className="text-[16px] font-medium text-ink-900">{plan.name}</h2>
                    <span className="rounded-full bg-brand-50 text-brand-700 px-2.5 h-6 inline-flex items-center text-[12px] font-medium">
                      {mode === "visitor" ? `${trialDays}-day free trial` : mode === "subscribed" ? "Active" : "Monthly"}
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] text-ink-500">{plan.blurb}</p>
                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span className="text-display-lg font-semibold text-ink-900 tabular-nums">${plan.priceUsd}</span>
                    <span className="text-[15px] text-ink-500">/month</span>
                  </div>
                  <ul className="mt-8 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[14px] text-ink-700">
                        <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {mode === "subscribed" ? (
                    <Link to="/app" className="btn-primary mt-9 h-11 w-full text-[15px]">
                      Go to the app <ArrowRight size={16} />
                    </Link>
                  ) : (
                    <button onClick={() => choose(plan.key)} disabled={busy === plan.key} className="btn-primary mt-9 h-11 w-full text-[15px]">
                      {busy === plan.key ? (
                        <>
                          <Loader2 className="animate-spin" size={16} /> Opening secure checkout…
                        </>
                      ) : (
                        ctaLabel
                      )}
                    </button>
                  )}
                </>
              ) : loadFailed ? (
                <div className="py-10 text-center" role="alert">
                  <p className="text-[15px] font-medium text-ink-900">Couldn’t load pricing.</p>
                  <p className="mt-1 text-[14px] text-ink-600">Check your connection and try again.</p>
                  <button onClick={() => window.location.reload()} className="btn-ghost mt-5 h-9 px-4">
                    Try again
                  </button>
                </div>
              ) : (
                // Skeleton that mirrors the card while the plan loads.
                <div className="animate-pulse" aria-hidden>
                  <div className="h-4 w-16 rounded bg-surface" />
                  <div className="mt-8 h-12 w-32 rounded bg-surface" />
                  <div className="mt-8 grid sm:grid-cols-2 gap-3">
                    {Array.from({ length: 6 }).map((_, n) => (
                      <div key={n} className="h-4 rounded bg-surface" />
                    ))}
                  </div>
                  <div className="mt-9 h-11 rounded-lg bg-surface" />
                </div>
              )}
            </div>

            <p className="mt-4 flex items-center justify-center gap-2 text-[13px] text-ink-500">
              <ShieldCheck size={14} className="text-ink-400" />
              {mode === "visitor" ? "No credit card required · Cancel anytime" : "Secure checkout by Stripe · Cancel anytime"}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
