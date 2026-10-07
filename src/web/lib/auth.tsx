import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { clearSticky } from "./sticky";

export type SubStatus = "none" | "trialing" | "trial_expired" | "active" | "past_due" | "canceled" | "incomplete";

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  timezone: string;
  plan: "starter" | "pro" | null;
  subscriptionStatus: SubStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  paywallDisabled?: boolean;
  hasAccess?: boolean; // computed by the server: active subscription, or an unexpired free trial
}

export function hasActivePlan(u: User | null): boolean {
  if (!u) return false;
  if (u.paywallDisabled) return true; // launch mode: everyone gets in
  if (typeof u.hasAccess === "boolean") return u.hasAccess;
  return u.subscriptionStatus === "trialing" || u.subscriptionStatus === "active";
}

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const { user } = await api<{ user: User | null }>("/auth/me"); // null = not signed in
      setUser((prev) => {
        if (prev && prev.id !== user?.id) clearSticky(); // signed out or different account: forget cached tab data
        return user;
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSticky(); // never show this account's cached data to the next person
    setUser(null);
  }

  // Any account change (sign-in as someone else, sign-out) wipes cached tab data.
  const setUserSafe = (u: User | null) => {
    setUser((prev) => {
      if (!u || (prev && prev.id !== u.id)) clearSticky();
      return u;
    });
  };

  return <AuthCtx.Provider value={{ user, loading, setUser: setUserSafe, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
