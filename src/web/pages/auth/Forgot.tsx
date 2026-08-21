import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell, { FieldError } from "./AuthShell";
import { api } from "../../lib/api";

export default function Forgot() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await api<{ registered: boolean }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      if (!res.registered) {
        setErr("There's no RelayFlow account with that email.");
        return;
      }
      nav("/reset", { state: { email } });
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we'll send you a reset code.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <FieldError message={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset code"}</button>
      </form>
      <p className="mt-6 text-sm text-ink-500">
        <Link to="/login" className="hover:text-ink-800">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
