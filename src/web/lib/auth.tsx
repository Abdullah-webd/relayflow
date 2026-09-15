import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export type SubStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  timezone: string;
  plan: "starter" | "growth" | null;
  subscriptionStatus: SubStatus;
  credits: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  paywallDisabled?: boolean;
}

export function hasActivePlan(u: User | null): boolean {
  if (!u) return false;
  if (u.paywallDisabled) return true; // launch mode: everyone gets in
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
      const { user } = await api<{ user: User }>("/auth/me");
      setUser(user);
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
    setUser(null);
  }

  return <AuthCtx.Provider value={{ user, loading, setUser, refresh, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
