import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { PRICES } from "../../lib/pricing";
import { CreditCard, Loader2, Check, ExternalLink } from "lucide-react";

interface BillingState {
  plan: "starter" | "pro" | null;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeSubscription?: boolean;
  paidPlan?: "starter" | "pro" | null;
  limits?: { monitors: number | null; scheduledTasks: number | null; autoReply: boolean; model: string };
  usage?: { monitors: number; scheduledTasks: number };
}

const TIMEZONES: string[] = (() => {
  try {
    // @ts-ignore - supportedValuesOf is widely available in modern browsers
    const all = Intl.supportedValuesOf?.("timeZone") as string[] | undefined;
    if (all && all.length) return all;
  } catch {
    /* fall through */
  }
  return ["UTC", "Africa/Lagos", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore"];
})();

const PLAN_NAMES: Record<string, string> = { starter: "Starter", pro: "Pro" };

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    trialing: "bg-brand-50 text-brand-700",
    active: "bg-emerald-50 text-emerald-700",
    past_due: "bg-amber-50 text-amber-700",
    trial_expired: "bg-amber-50 text-amber-700",
    canceled: "bg-surface text-ink-600",
    none: "bg-surface text-ink-600",
  };
  const label: Record<string, string> = {
    trialing: "Free trial",
    trial_expired: "Trial ended",
    active: "Active",
    past_due: "Payment due",
    canceled: "Canceled",
    none: "No plan",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[status] || map.none}`}>{label[status] || status}</span>;
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 card p-6">
      <h2 className="font-semibold text-ink-900 text-lg">{title}</h2>
      {desc && <p className="mt-1 text-sm text-ink-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();

  const [name, setName] = useState(user?.name || "");
  const [timezone, setTimezone] = useState(user?.timezone || "UTC");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [billing, setBilling] = useState<BillingState | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    api<BillingState>("/billing/state").then(setBilling).catch(() => undefined);
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      const { user: u } = await api<{ user: any }>("/auth/profile", { method: "PATCH", body: JSON.stringify({ name, timezone }) });
      setUser(u);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } finally {
      setSavingProfile(false);
    }
  }

  async function manageBilling() {
    setPortalBusy(true);
    try {
      const { url } = await api<{ url: string }>("/billing/portal", { method: "POST" });
      window.location.href = url;
    } catch {
      setPortalBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwBusy(true);
    setPwMsg(null);
    try {
      await api("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }) });
      setPwMsg({ ok: true, text: "Password updated." });
      setCurPw("");
      setNewPw("");
    } catch (e: any) {
      setPwMsg({ ok: false, text: e?.data?.detail || "Could not change password." });
    } finally {
      setPwBusy(false);
    }
  }

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-semibold text-ink-900">Settings</h1>

        {/* Profile */}
        <Section title="Profile" desc="How you appear in RelayFlow and the timezone used for scheduled tasks.">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input bg-surface text-ink-500" value={user?.email || ""} disabled />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Timezone</label>
              <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {!TIMEZONES.includes(timezone) && <option value={timezone}>{timezone}</option>}
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={saveProfile} disabled={savingProfile} className="btn-primary">
              {savingProfile ? <Loader2 className="animate-spin" size={18} /> : "Save changes"}
            </button>
            {profileSaved && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <Check size={16} /> Saved
              </span>
            )}
          </div>
        </Section>

        {/* Plan & billing */}
        <Section title="Plan & billing" desc="Manage your subscription, payment method, and invoices.">
          <div className="rounded-xl border border-line p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center h-11 w-11 rounded-xl bg-brand-50 text-brand-600">
                <CreditCard size={20} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink-900">
                    {billing?.status === "trialing" ? "Free trial (Pro features)" : billing?.plan && billing.status === "active" ? PLAN_NAMES[billing.plan] : "No plan"}
                  </span>
                  <StatusBadge status={billing?.status || "none"} />
                </div>
                <div className="text-sm text-ink-500">
                  {billing?.status === "trialing" && billing.trialEndsAt
                    ? `Free trial ends ${new Date(billing.trialEndsAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. No card on file.`
                    : billing?.status === "trial_expired"
                    ? "Your free trial has ended. Subscribe to keep using RelayFlow."
                    : billing?.cancelAtPeriodEnd
                    ? `Cancels on ${fmt(billing?.currentPeriodEnd ?? null)}`
                    : billing?.currentPeriodEnd
                    ? `Renews ${fmt(billing.currentPeriodEnd)} · $${PRICES[billing.plan === "starter" ? "starter" : "pro"]}/month`
                    : billing?.status === "active"
                    ? "Active"
                    : "Subscribe to use RelayFlow"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {billing?.hasStripeSubscription ? (
                <>
                  <button onClick={() => nav("/pricing")} className="btn-ghost">
                    {billing.plan === "starter" ? "Upgrade to Pro" : "Change plan"}
                  </button>
                  <button onClick={manageBilling} disabled={portalBusy} className="btn-primary">
                    {portalBusy ? <Loader2 className="animate-spin" size={18} /> : <>Manage billing <ExternalLink size={16} /></>}
                  </button>
                </>
              ) : billing && billing.status !== "active" ? (
                <button onClick={() => nav("/pricing")} className="btn-primary">
                  Choose a plan
                </button>
              ) : null}
            </div>
          </div>

          {/* What the current plan includes, and how much of it is used. */}
          {billing?.limits && billing.usage && (
            <dl className="mt-4 grid sm:grid-cols-3 gap-3">
              {[
                { t: "Monitors", v: billing.limits.monitors === null ? `${billing.usage.monitors} · unlimited` : `${billing.usage.monitors} of ${billing.limits.monitors}` },
                { t: "Scheduled tasks", v: billing.limits.scheduledTasks === null ? `${billing.usage.scheduledTasks} · unlimited` : `${billing.usage.scheduledTasks} of ${billing.limits.scheduledTasks}` },
                { t: "Auto-replies & AI", v: billing.limits.autoReply ? "Included · smarter model" : "Pro only · standard model" },
              ].map((row) => (
                <div key={row.t} className="rounded-xl border border-line px-4 py-3">
                  <dt className="text-[12px] text-ink-500">{row.t}</dt>
                  <dd className="mt-0.5 text-[14px] font-medium text-ink-900 tabular-nums">{row.v}</dd>
                </div>
              ))}
            </dl>
          )}
        </Section>

        {/* Security */}
        <Section title="Security" desc="Change your password or sign out everywhere.">
          <form onSubmit={changePassword} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Current password</label>
              <input className="input" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" />
            </div>
            <div>
              <label className="label">New password</label>
              <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button type="submit" disabled={pwBusy || !curPw || newPw.length < 8} className="btn-primary">
                {pwBusy ? <Loader2 className="animate-spin" size={18} /> : "Update password"}
              </button>
              {pwMsg && <span className={`text-sm font-medium ${pwMsg.ok ? "text-emerald-600" : "text-red-600"}`}>{pwMsg.text}</span>}
            </div>
          </form>
          <div className="mt-5 pt-5 border-t border-line">
            <button
              onClick={async () => {
                await api("/auth/logout-all", { method: "POST" }).catch(() => undefined);
                await logout();
                nav("/login");
              }}
              className="btn-ghost"
            >
              Sign out of all devices
            </button>
          </div>
        </Section>

        {/* Session */}
        <Section title="This device" desc="Sign out of RelayFlow on this device only.">
          <button
            onClick={async () => {
              await logout();
              nav("/login");
            }}
            className="btn-ghost"
          >
            Sign out
          </button>
        </Section>
      </div>
    </div>
  );
}
