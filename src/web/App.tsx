import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth, hasActivePlan } from "./lib/auth";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import Verify from "./pages/auth/Verify";
import Forgot from "./pages/auth/Forgot";
import Reset from "./pages/auth/Reset";
import AppLayout from "./pages/app/AppLayout";
import Chat from "./pages/app/Chat";
import Connections from "./pages/app/Connections";
import Tasks from "./pages/app/Tasks";
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route
        path="/app"
        element={
          <RequireActivePlan>
            <AppLayout />
          </RequireActivePlan>
        }
      >
        <Route index element={<Navigate to="/app/chat" replace />} />
        {/* One route (optional param) so navigating to a new chat id does NOT remount
            the component and wipe the in-progress message state. */}
        <Route path="chat/:chatId?" element={<Chat />} />
        <Route path="connections" element={<Connections />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
