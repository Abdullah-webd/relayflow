import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth";

function timeLeft(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 1) return `${h}h ${m}m left`;
  return `${m}m left`;
}

/**
 * Free-trial bar. Counts down, and the moment the trial ends it refreshes the session so
 * the route guard sends the user to the paywall (the server also rejects every API call).
 */
function TrialBar() {
  const { user, refresh } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const endsAt = user?.trialEndsAt ? new Date(user.trialEndsAt).getTime() : null;
  const onTrial = user?.subscriptionStatus === "trialing" && !user?.paywallDisabled && endsAt !== null;

  useEffect(() => {
    if (!onTrial) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [onTrial]);

  useEffect(() => {
    if (!onTrial || endsAt === null) return;
    const t = setTimeout(() => void refresh(), Math.max(0, endsAt - Date.now()) + 1000);
    return () => clearTimeout(t);
  }, [onTrial, endsAt, refresh]);

  if (!onTrial || endsAt === null) return null;
  return (
    <div className="flex items-center justify-center gap-3 h-10 px-4 border-b border-brand-100 bg-brand-50 text-[13px] text-brand-800">
      <span>
        <span className="font-medium">Free trial</span> · <span className="tabular-nums">{timeLeft(endsAt - now)}</span>
      </span>
      <Link to="/pricing" className="font-medium underline underline-offset-2 decoration-brand-300 hover:decoration-brand-700">
        Subscribe
      </Link>
    </div>
  );
}
import {
  MessageSquare,
  Plug,
  Clock,
  BookOpen,
  Settings as Gear,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Zap,
} from "lucide-react";

const items = [
  { to: "/app/chat", label: "Chat", icon: MessageSquare },
  { to: "/app/connections", label: "Connections", icon: Plug },
  { to: "/app/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/app/tasks", label: "Scheduled", icon: Clock },
  { to: "/app/settings", label: "Settings", icon: Gear },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("rf_sidebar") === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("rf_sidebar", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // On mobile the drawer is always full-label; collapse only applies on desktop (md+).
  const compact = collapsed;

  const sidebar = (
    <aside
      className={`${compact ? "md:w-[72px]" : "md:w-60"} w-64 h-full shrink-0 bg-white border-r border-line flex flex-col transition-[width] duration-200`}
    >
      <div className={`flex items-center h-16 px-4 ${compact ? "md:justify-center justify-between" : "justify-between"}`}>
        {(!compact || mobileOpen) && <Logo byline />}
        {/* Desktop collapse toggle */}
        <button
          onClick={toggle}
          className="hidden md:grid place-items-center h-9 w-9 rounded-lg text-ink-500 hover:bg-surface"
          title={compact ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
        >
          {compact ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
        {/* Mobile close */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden grid place-items-center h-9 w-9 rounded-lg text-ink-500 hover:bg-surface"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="px-3 space-y-0.5 flex-1">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            title={n.label}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 h-9 rounded-lg text-[14px] font-medium transition-colors duration-150 ${compact ? "md:justify-center md:px-0 px-3" : "px-3"} ${
                isActive ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-surface hover:text-ink-900"
              }`
            }
          >
            <n.icon size={18} strokeWidth={1.75} className="shrink-0 opacity-80" />
            <span className={compact ? "md:hidden" : ""}>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Plan chip */}
      {(!compact || mobileOpen) && (
        <Link
          to="/app/settings"
          onClick={() => setMobileOpen(false)}
          className="mx-3 mb-2 flex items-center justify-between rounded-lg border border-line px-3 h-10 transition-colors hover:bg-surface"
        >
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-600">
            <Zap size={15} strokeWidth={1.75} className="text-brand-600" /> Plan
          </span>
          <span className="text-[13px] font-medium text-ink-900">
            {user?.paywallDisabled
              ? "Free"
              : user?.subscriptionStatus === "trialing"
              ? "Trial"
              : user?.subscriptionStatus === "active"
              ? user?.plan === "starter"
                ? "Starter"
                : "Pro"
              : "—"}
          </span>
        </Link>
      )}

      <div className="p-3 border-t border-line">
        <div className={`flex items-center gap-3 px-2 py-2 ${compact ? "md:justify-center" : ""}`}>
          <span className="grid place-items-center h-8 w-8 rounded-full border border-line bg-surface text-[13px] text-ink-700 font-semibold shrink-0">
            {(user?.name || user?.email || "?")[0]?.toUpperCase()}
          </span>
          <div className={`min-w-0 flex-1 ${compact ? "md:hidden" : ""}`}>
            <div className="font-semibold text-sm text-ink-900 truncate">{user?.name || "You"}</div>
            <div className="text-xs text-ink-500 truncate">{user?.email}</div>
          </div>
        </div>
        <button
          onClick={async () => {
            await logout();
            nav("/login");
          }}
          title="Sign out"
          className={`mt-1 w-full flex items-center gap-2 h-10 rounded-xl text-sm text-ink-600 hover:bg-surface ${compact ? "md:justify-center md:px-0 px-3" : "px-3"}`}
        >
          <LogOut size={18} className="shrink-0" />
          <span className={compact ? "md:hidden" : ""}>Sign out</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="h-full flex bg-white">
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-full">{sidebar}</div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 h-full">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 h-14 px-4 bg-white border-b border-line">
          <button onClick={() => setMobileOpen(true)} className="grid place-items-center h-9 w-9 rounded-lg text-ink-600 hover:bg-surface" aria-label="Open menu">
            <Menu size={22} />
          </button>
          <Logo size={26} />
        </div>
        <TrialBar />
        <main className="flex-1 min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
