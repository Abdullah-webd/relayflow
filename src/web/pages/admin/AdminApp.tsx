import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Eye, EyeOff, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Logo } from "../../components/Logo";
import { ToastProvider } from "../../components/ui";
import { EASE_OUT, SPRING } from "../../components/motion";
import { adminApi, useNow, AdminCtx } from "./kit";
import AdminOverview from "./Overview";
import AdminUsers from "./Users";
import AdminUsage from "./Usage";
import AdminChannels from "./Channels";
import AdminRevenue from "./Revenue";
import AdminReports from "./ReportsAdmin";

type Status = { configured: boolean; signedIn: boolean; email: string | null };


const TABS = [
  { to: "overview", label: "Overview" },
  { to: "users", label: "Users" },
  { to: "usage", label: "Usage" },
  { to: "channels", label: "Channels" },
  { to: "revenue", label: "Revenue" },
  { to: "reports", label: "Reports" },
];

export default function AdminApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const check = () => fetch("/api/admin/status", { credentials: "include" }).then((r) => r.json()).then(setStatus).catch(() => setStatus({ configured: false, signedIn: false, email: null }));
  useEffect(() => {
    check();
  }, []);

  if (!status) return <div className="grid h-full place-items-center"><Loader2 className="animate-spin text-brand-600" /></div>;
  if (!status.configured) return <NotConfigured />;
  if (!status.signedIn) return <Login onDone={check} />;
  return (
    <ToastProvider>
      <Console email={status.email || ""} onSignedOut={() => setStatus({ ...status, signedIn: false })} />
    </ToastProvider>
  );
}

function NotConfigured() {
  return (
    <div className="rf-app grid min-h-full place-items-center bg-white px-4">
      <div className="max-w-md text-center">
        <Logo size={30} />
        <h1 className="mt-6 font-display text-[22px] font-semibold text-navy">Admin sign-in isn't set up here</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-500">
          Set <code className="kbd">ADMIN_EMAIL</code> and <code className="kbd">ADMIN_PASSWORD_HASH</code> on this server, then reload. Create them with{" "}
          <code className="kbd">npx tsx scripts/admin-password.ts</code>.
        </p>
      </div>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await adminApi("/login", { method: "POST", body: JSON.stringify({ email, password }) });
      onDone();
    } catch (e) {
      setErr((e as Error).message === "Signed out" ? "That email and password don't match." : (e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="rf-app grid min-h-full place-items-center bg-white px-4 py-10">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        className="w-full max-w-[380px]"
      >
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="rounded-md bg-navy px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Admin</span>
        </div>
        <h1 className="mt-8 font-display text-[26px] font-semibold tracking-[-0.02em] text-navy">Sign in to the console</h1>
        <p className="mt-1.5 text-[14px] text-ink-500">For the RelayFlow team only. Every attempt is logged.</p>
        <label className="label mt-7" htmlFor="ad-email">Email</label>
        <input id="ad-email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
        <label className="label mt-4" htmlFor="ad-pass">Password</label>
        <div className="relative">
          <input id="ad-pass" type={show ? "text" : "password"} autoComplete="current-password" className="input pr-11" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:text-ink-700" aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <AnimatePresence>
          {err && (
            <motion.p role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden text-[13px] text-red-600">
              {err}
            </motion.p>
          )}
        </AnimatePresence>
        <button type="submit" disabled={busy} className="btn-primary mt-6 h-11 w-full">
          {busy ? <Loader2 size={17} className="animate-spin" /> : <><ShieldCheck size={16} /> Sign in</>}
        </button>
      </motion.form>
    </div>
  );
}

function LiveIndicator({ updatedAt }: { updatedAt: number | null }) {
  const now = useNow(1000);
  const secs = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const stale = secs !== null && secs > 45;
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-500" aria-live="off">
      <span className="relative grid h-2.5 w-2.5 place-items-center">
        {/* One ring per refresh (keyed by time), never an endless pulse. */}
        <AnimatePresence>
          {updatedAt && !stale && (
            <motion.span key={updatedAt} className="absolute inset-0 rounded-full bg-emerald-400" initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.9, ease: EASE_OUT }} />
          )}
        </AnimatePresence>
        <span className={`h-2 w-2 rounded-full ${stale ? "bg-amber-500" : "bg-emerald-500"}`} />
      </span>
      {secs === null ? "Connecting…" : stale ? `Last update ${secs}s ago` : `Live, updated ${secs}s ago`}
    </span>
  );
}

function Console({ email, onSignedOut }: { email: string; onSignedOut: () => void }) {
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [openReports, setOpenReports] = useState(0);
  const nav = useNavigate();
  const tab = useLocation().pathname.split("/")[2] || "overview";

  useEffect(() => {
    // The tab badge for open reports stays current on every tab.
    const load = () => adminApi<{ counts: Record<string, number> }>("/reports?status=open").then((r) => setOpenReports((r.counts.open ?? 0) + (r.counts.in_progress ?? 0))).catch(() => undefined);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => clearInterval(t);
  }, []);

  async function signOut() {
    await adminApi("/logout", { method: "POST" }).catch(() => undefined);
    onSignedOut();
    nav("/admin");
  }

  return (
    <AdminCtx.Provider value={{ markUpdated: setUpdatedAt, signedOut: onSignedOut, openReports, setOpenReports }}>
      <div className="rf-app flex h-full flex-col bg-white">
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 px-4 sm:px-6">
            <Logo size={24} />
            <span className="rounded-md bg-navy px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Admin</span>
            <div className="ml-auto flex items-center gap-4">
              <span className="hidden sm:inline-flex"><LiveIndicator updatedAt={updatedAt} /></span>
              <span className="hidden text-[12.5px] text-ink-400 md:inline">{email}</span>
              <button onClick={signOut} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-ink-600 hover:bg-surface hover:text-ink-900">
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-[1320px] gap-1 overflow-x-auto px-2 sm:px-4" aria-label="Admin sections">
            {TABS.map((t) => (
              <NavLink key={t.to} to={`/admin/${t.to}`} className={({ isActive }) => `relative flex h-11 shrink-0 items-center gap-2 px-3 text-[14px] font-medium transition-colors ${isActive ? "text-navy" : "text-ink-500 hover:text-ink-800"}`}>
                {({ isActive }) => (
                  <>
                    {t.label}
                    {t.to === "reports" && openReports > 0 && (
                      <motion.span key={openReports} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-100 px-1.5 text-[11.5px] font-semibold tabular-nums text-amber-800">
                        {openReports}
                      </motion.span>
                    )}
                    {isActive && <motion.span layoutId="admin-tab" className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-brand-600" transition={SPRING} />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="flex-1 overflow-y-auto">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }} className="mx-auto max-w-[1320px] px-4 pb-16 pt-7 sm:px-6">
            <Routes>
              <Route index element={<Navigate to="/admin/overview" replace />} />
              <Route path="overview" element={<AdminOverview />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="usage" element={<AdminUsage />} />
              <Route path="channels" element={<AdminChannels />} />
              <Route path="revenue" element={<AdminRevenue />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="*" element={<Navigate to="/admin/overview" replace />} />
            </Routes>
          </motion.div>
        </main>
      </div>
    </AdminCtx.Provider>
  );
}
