import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth";
import { MessageSquare, Plug, Clock, Settings as Gear, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const items = [
  { to: "/app/chat", label: "Chat", icon: MessageSquare },
  { to: "/app/connections", label: "Connections", icon: Plug },
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

  return (
    <div className="h-full flex bg-surface">
      <aside
        className={`${collapsed ? "w-[72px]" : "w-60"} shrink-0 bg-white border-r border-line flex flex-col transition-[width] duration-200`}
      >
        <div className={`flex items-center h-16 px-4 ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && <Logo />}
          <button
            onClick={toggle}
            className="grid place-items-center h-9 w-9 rounded-lg text-ink-500 hover:bg-surface"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>

        <nav className="px-3 space-y-1 flex-1">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              title={n.label}
              className={({ isActive }) =>
                `flex items-center gap-3 h-11 rounded-xl text-[15px] font-medium transition ${collapsed ? "justify-center px-0" : "px-3"} ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-surface"
                }`
              }
            >
              <n.icon size={20} className="shrink-0" />
              {!collapsed && n.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-line">
          <div className={`flex items-center gap-3 px-2 py-2 ${collapsed ? "justify-center" : ""}`}>
            <span className="grid place-items-center h-9 w-9 rounded-full bg-brand-100 text-brand-700 font-bold shrink-0">
              {(user?.name || user?.email || "?")[0]?.toUpperCase()}
            </span>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-ink-900 truncate">{user?.name || "You"}</div>
                <div className="text-xs text-ink-500 truncate">{user?.email}</div>
              </div>
            )}
          </div>
          <button
            onClick={async () => {
              await logout();
              nav("/login");
            }}
            title="Sign out"
            className={`mt-1 w-full flex items-center gap-2 h-10 rounded-xl text-sm text-ink-600 hover:bg-surface ${collapsed ? "justify-center px-0" : "px-3"}`}
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
