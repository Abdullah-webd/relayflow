import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell, { FieldError } from "./AuthShell";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function Login() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { user } = await api<{ user: any }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setUser(user);
      nav("/app");
    } catch (error) {
      if (error instanceof ApiError && error.data?.error === "email_unverified") {
        nav("/verify", { state: { email } });
        return;
      }
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your RelayFlow workspace.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <FieldError message={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <div className="mt-6 flex items-center justify-between text-sm text-ink-500">
        <Link to="/forgot" className="hover:text-ink-800">Forgot password?</Link>
        <span>
          New here?{" "}
          <Link to="/signup" className="text-brand-600 font-semibold hover:text-brand-700">Create account</Link>
        </span>
      </div>
    </AuthShell>
  );
}
