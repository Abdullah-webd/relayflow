import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthShell, { FieldError, Notice } from "./AuthShell";
import { api } from "../../lib/api";

export default function Reset() {
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState((loc.state as any)?.email || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ email, code, password }) });
      nav("/login", { state: { reset: true } });
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Set a new password" subtitle="Enter the code we emailed you and choose a new password.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Reset code</label>
          <input
            className="input tracking-[0.3em] text-center font-semibold"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            inputMode="numeric"
            required
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="At least 8 characters" />
        </div>
        <FieldError message={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </form>
      <p className="mt-6 text-sm text-ink-500">
        <Link to="/login" className="hover:text-ink-800">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
