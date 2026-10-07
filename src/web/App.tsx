import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { metaFor, NOT_FOUND_META } from "../shared/seo";
import { useAuth, hasActivePlan } from "./lib/auth";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import Verify from "./pages/auth/Verify";
import Forgot from "./pages/auth/Forgot";
import Reset from "./pages/auth/Reset";
import AppLayout from "./pages/app/AppLayout";
import Chat from "./pages/app/Chat";
import Connections from "./pages/app/Connections";
import Overview from "./pages/app/Overview";
import AutoReplies from "./pages/app/AutoReplies";
import Monitors from "./pages/app/Monitors";
import Schedules from "./pages/app/Schedules";
import Settings from "./pages/app/Settings";
import { type ReactNode } from "react";

function FullLoader() {
  return (
    <div className="h-full grid place-items-center text-ink-500">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        Loading…
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Hard client gate: dashboard requires a verified email AND an active/trialing plan.
// (The server independently enforces this on every API call — this is just UX.)
function RequireActivePlan({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasActivePlan(user)) return <Navigate to="/pricing" replace />;
  return <>{children}</>;
}

function useRouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = (metaFor(pathname) ?? NOT_FOUND_META).title;
  }, [pathname]);
}

export default function App() {
  useRouteTitle();
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route
        path="/app"
        element={
          <RequireActivePlan>
            <AppLayout />
          </RequireActivePlan>
        }
      >
        <Route index element={<Navigate to="/app/overview" replace />} />
        <Route path="overview" element={<Overview />} />
        {/* One route (optional param) so navigating to a new chat id does NOT remount
            the component and wipe the in-progress message state. */}
        <Route path="chat/:chatId?" element={<Chat />} />
        <Route path="connections" element={<Connections />} />
        <Route path="auto-replies/:id?" element={<AutoReplies />} />
        <Route path="monitors" element={<Monitors />} />
        <Route path="schedules" element={<Schedules />} />
        {/* Old addresses (bookmarks, emails) keep working. */}
        <Route path="knowledge" element={<Navigate to="/app/auto-replies" replace />} />
        <Route path="tasks" element={<Navigate to="/app/schedules" replace />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
