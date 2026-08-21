import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
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
