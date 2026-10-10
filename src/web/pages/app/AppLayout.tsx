import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { EASE_OUT, SPRING } from "../../components/motion";
import { ToastProvider } from "../../components/ui";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth";
import {
  LayoutGrid,
  MessageSquare,
  Plug,
  CalendarClock,
  Bot,
  Radar,
  Settings as Gear,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  Search,
  CornerDownLeft,
  Plus,
  LifeBuoy,
} from "lucide-react";
import { api } from "../../lib/api";

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
    <div className="flex h-9 items-center justify-center gap-3 border-b border-brand-100 bg-brand-50 px-4 text-[13px] text-brand-800">
      <span>
        <span className="font-medium">Free trial</span>, <span className="tabular-nums">{timeLeft(endsAt - now)}</span>
      </span>
      <Link to="/pricing" className="font-medium underline decoration-brand-300 underline-offset-2 hover:decoration-brand-700">
        Subscribe
      </Link>
    </div>
  );
}

const GROUPS = [
  {
    label: null,
    items: [
      { to: "/app/overview", label: "Overview", icon: LayoutGrid },
      { to: "/app/chat", label: "Chat", icon: MessageSquare },
    ],
  },
  {
    label: "Automations",
    items: [
      { to: "/app/auto-replies", label: "Auto-replies", icon: Bot },
      { to: "/app/monitors", label: "Monitors", icon: Radar },
      { to: "/app/schedules", label: "Schedules", icon: CalendarClock },
    ],
  },
  {
    label: "Workspace",
    items: [
      { to: "/app/connections", label: "Connections", icon: Plug },
      { to: "/app/settings", label: "Settings", icon: Gear },
      { to: "/app/reports", label: "Report a problem", icon: LifeBuoy },
    ],
  },
];

const COMMANDS = [
  ...GROUPS.flatMap((g) => g.items.map((i) => ({ label: `Go to ${i.label}`, to: i.to, icon: i.icon, hint: "Page" }))),
  { label: "New chat", to: "/app/chat", icon: Plus, hint: "Action" },
  { label: "New auto-reply", to: "/app/auto-replies?new=1", icon: Plus, hint: "Action" },
  { label: "New monitor", to: "/app/monitors?new=1", icon: Plus, hint: "Action" },
  { label: "New schedule", to: "/app/schedules?new=1", icon: Plus, hint: "Action" },
  { label: "Connect a channel", to: "/app/connections", icon: Plug, hint: "Action" },
  { label: "Report a problem", to: "/app/reports", icon: LifeBuoy, hint: "Action" },
];

const TRACKED = new Set(["overview", "chat", "auto-replies", "monitors", "schedules", "connections", "settings", "reports"]);

/**
 * Anonymous-to-others usage signal for the admin console: which tab is open and for how long
 * (a ping on each tab switch, then every 30s while the page is visible). Never message content.
 */
function useUsageTracking(section: string) {
  useEffect(() => {
    if (!TRACKED.has(section)) return;
    if (section !== "reports") {
      try {
        sessionStorage.setItem("rf_last_section", section); // pre-fills "Where in RelayFlow?" on Report
      } catch {
        /* ignore */
      }
    }
    const ping = (seconds: number) => api("/track", { method: "POST", body: JSON.stringify({ section, seconds }) }).catch(() => undefined);
    ping(0);
    const t = setInterval(() => document.visibilityState === "visible" && ping(30), 30_000);
    return () => clearInterval(t);
  }, [section]);
}

/** ⌘K: jump to any page or start any action from the keyboard. */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => COMMANDS.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase())), [q]);
  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => setI(0), [q]);
  const go = (to: string) => {
    onClose();
    nav(to);
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 bg-ink-900/30 px-4 pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} onMouseDown={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Quick jump"
            className="mx-auto w-full max-w-[520px] overflow-hidden rounded-2xl border border-line bg-white shadow-pop"
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search size={17} className="text-ink-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onClose();
                  if (e.key === "ArrowDown") (e.preventDefault(), setI((x) => Math.min(results.length - 1, x + 1)));
                  if (e.key === "ArrowUp") (e.preventDefault(), setI((x) => Math.max(0, x - 1)));
                  if (e.key === "Enter" && results[i]) go(results[i].to);
                }}
                placeholder="Jump to a page or start something…"
                className="h-12 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-400"
              />
              <span className="kbd">Esc</span>
            </div>
            <ul className="max-h-[320px] overflow-y-auto p-1.5">
              {results.length === 0 && <li className="px-3 py-6 text-center text-[14px] text-ink-500">Nothing matches “{q}”.</li>}
              {results.map((c, idx) => (
                <li key={c.label}>
                  <button
                    onMouseEnter={() => setI(idx)}
                    onClick={() => go(c.to)}
                    className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] ${idx === i ? "bg-brand-50 text-brand-800" : "text-ink-700"}`}
                  >
                    <c.icon size={16} strokeWidth={1.8} className={idx === i ? "text-brand-600" : "text-ink-400"} />
                    <span className="flex-1">{c.label}</span>
                    {idx === i ? <CornerDownLeft size={14} className="text-brand-500" /> : <span className="text-[12px] text-ink-400">{c.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function AppLayout() {
  // Top-level section ("overview", "chat", …): moving inside a section doesn't re-animate the page.
  const { pathname } = useLocation();
  const section = pathname.split("/")[2] || "overview";
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  useUsageTracking(section);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

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

  const planLabel = user?.paywallDisabled
    ? "Free access"
    : user?.subscriptionStatus === "trialing"
    ? "Pro trial"
    : user?.subscriptionStatus === "active"
    ? user?.plan === "starter"
      ? "Starter plan"
      : "Pro plan"
    : "No plan";

  const sidebar = (variant: "desk" | "mobile") => {
    const compact = variant === "desk" && collapsed;
    return (
      <aside className={`${compact ? "w-[68px]" : variant === "desk" ? "w-[236px]" : "w-[272px]"} flex h-full shrink-0 flex-col border-r border-line bg-white transition-[width] duration-200 ease-out`}>
        <div className={`flex h-14 items-center px-3.5 ${compact ? "justify-center" : "justify-between"}`}>
          {!compact && (
            <Link to="/app/overview" aria-label="RelayFlow home" className="pl-1">
              <Logo size={26} />
            </Link>
          )}
          {variant === "desk" ? (
            <button onClick={toggle} className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-surface hover:text-ink-700" aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} title={compact ? "Expand sidebar" : "Collapse sidebar"}>
              {compact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          ) : (
            <button onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-surface" aria-label="Close menu">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={() => setPaletteOpen(true)}
            className={`flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-white text-[13.5px] text-ink-400 transition-colors hover:border-line-strong hover:text-ink-600 ${compact ? "justify-center" : "px-2.5"}`}
            aria-label="Quick jump"
            title="Quick jump"
          >
            <Search size={15} />
            {!compact && (
              <>
                <span className="flex-1 text-left">Jump to…</span>
                <span className="kbd">{isMac ? "⌘" : "Ctrl"} K</span>
              </>
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {GROUPS.map((g, gi) => (
            <div key={gi} className={gi ? "mt-5" : "mt-1"}>
              {g.label && !compact && <div className="mb-1 px-2.5 text-[12px] font-medium text-ink-400">{g.label}</div>}
              {g.label && compact && <div className="mx-auto mb-2 h-px w-6 bg-line" />}
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    title={n.label}
                    className={({ isActive }) =>
                      `relative flex h-9 items-center gap-2.5 rounded-lg text-[14px] font-medium transition-colors duration-150 ${compact ? "justify-center" : "px-2.5"} ${
                        isActive ? "text-brand-700" : "text-ink-600 hover:bg-surface hover:text-ink-900"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* One highlight that slides to the active page. */}
                        {isActive && <motion.span layoutId={`nav-pill-${variant}`} className="absolute inset-0 rounded-lg bg-brand-50 ring-1 ring-inset ring-brand-100" transition={SPRING} />}
                        <n.icon size={17} strokeWidth={1.8} className={`relative shrink-0 ${isActive ? "text-brand-600" : "text-ink-400"}`} />
                        {!compact && <span className="relative">{n.label}</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-line p-3">
          <div className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 ${compact ? "justify-center" : ""}`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy text-[13px] font-semibold text-white">{(user?.name || user?.email || "?")[0]?.toUpperCase()}</span>
            {!compact && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-ink-900">{user?.name || user?.email?.split("@")[0]}</div>
                <Link to="/app/settings" className="block truncate text-[12px] text-ink-500 hover:text-brand-700">
                  {planLabel}
                </Link>
              </div>
            )}
            {!compact && (
              <button
                onClick={async () => {
                  await logout();
                  nav("/login");
                }}
                title="Sign out"
                aria-label="Sign out"
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-surface hover:text-ink-700"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
    );
  };

  return (
    <ToastProvider>
      <div className="rf-app flex h-full bg-white">
        <div className="hidden h-full md:flex">{sidebar("desk")}</div>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <div className="fixed inset-0 z-40 flex md:hidden">
              <motion.div className="absolute inset-0 bg-ink-900/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
              <motion.div className="relative z-50 h-full" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280, transition: { duration: 0.18 } }} transition={{ duration: 0.26, ease: EASE_OUT }}>
                {sidebar("mobile")}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 items-center gap-3 border-b border-line bg-white px-4 md:hidden">
            <button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-surface" aria-label="Open menu">
              <Menu size={22} />
            </button>
            <Logo size={24} />
            <button onClick={() => setPaletteOpen(true)} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-surface" aria-label="Quick jump">
              <Search size={19} />
            </button>
          </div>
          <TrialBar />
          <main className="min-w-0 flex-1 overflow-hidden">
            {/* Page switch: the new page lifts in (no exit wait, so switching never feels slow). */}
            <motion.div key={section} className="h-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
              <Outlet />
            </motion.div>
          </main>
        </div>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
    </ToastProvider>
  );
}
