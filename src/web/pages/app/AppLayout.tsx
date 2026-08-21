import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Logo } from "../../components/Logo";
import { useAuth } from "../../lib/auth";
import { MessageSquare, Plug, Clock, Settings as Gear, LogOut } from "lucide-react";

const items = [
  { to: "/app/chat", label: "Chat", icon: MessageSquare },
  { to: "/app/connections", label: "Connections", icon: Plug },
  { to: "/app/tasks", label: "Scheduled", icon: Clock },
  { to: "/app/settings", label: "Settings", icon: Gear },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="h-full flex bg-surface">
      <aside className="w-60 shrink-0 bg-white border-r border-line flex flex-col">
        <div className="p-4">
          <Logo />
        </div>
        <nav className="px-3 space-y-1 flex-1">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 h-11 rounded-xl text-[15px] font-medium transition ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-surface"
                }`
              }
            >
              <n.icon size={19} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-line">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="grid place-items-center h-9 w-9 rounded-full bg-brand-100 text-brand-700 font-bold">
              {(user?.name || user?.email || "?")[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-ink-900 truncate">{user?.name || "You"}</div>
              <div className="text-xs text-ink-500 truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              nav("/login");
            }}
            className="mt-1 w-full flex items-center gap-2 px-3 h-10 rounded-xl text-sm text-ink-600 hover:bg-surface"
          >
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
