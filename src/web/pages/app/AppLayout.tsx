import { useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth";
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

      <nav className="px-3 space-y-1 flex-1">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            title={n.label}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 h-11 rounded-xl text-[15px] font-medium transition ${compact ? "md:justify-center md:px-0 px-3" : "px-3"} ${
                isActive ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-surface"
              }`
            }
          >
            <n.icon size={20} className="shrink-0" />
            <span className={compact ? "md:hidden" : ""}>{n.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Credits chip */}
      {(!compact || mobileOpen) && (
        <Link
          to="/app/settings"
          onClick={() => setMobileOpen(false)}
          className="mx-3 mb-1 flex items-center justify-between rounded-xl border border-line px-3 py-2.5 hover:bg-surface"
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink-700">
            <Zap size={16} className="text-brand-600" /> Credits
          </span>
          <span className="text-sm font-bold text-ink-900">{user?.credits ?? 0}</span>
        </Link>
      )}

      <div className="p-3 border-t border-line">
        <div className={`flex items-center gap-3 px-2 py-2 ${compact ? "md:justify-center" : ""}`}>
          <span className="grid place-items-center h-9 w-9 rounded-full bg-brand-100 text-brand-700 font-bold shrink-0">
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
    <div className="h-full flex bg-surface">
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
        <main className="flex-1 min-w-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
