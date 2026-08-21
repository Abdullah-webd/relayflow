import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell, { FieldError } from "./AuthShell";
import { api } from "../../lib/api";

export default function Signup() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) });
      nav("/verify", { state: { email } });
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your workspace" subtitle="Connect your channels and put one AI agent across all of them.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Your name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="At least 8 characters" />
        </div>
        <FieldError message={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
      <p className="mt-6 text-sm text-ink-500">
        Already have an account?{" "}
        <Link to="/login" className="text-brand-600 font-semibold hover:text-brand-700">Sign in</Link>
      </p>
    </AuthShell>
  );
}
