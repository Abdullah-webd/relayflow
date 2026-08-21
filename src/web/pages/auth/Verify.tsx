import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthShell, { FieldError, Notice } from "./AuthShell";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function Verify() {
  const nav = useNavigate();
  const loc = useLocation();
  const { setUser } = useAuth();
  const [email, setEmail] = useState((loc.state as any)?.email || "");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { user } = await api<{ user: any }>("/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });
      setUser(user);
      nav("/app");
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setErr(null);
    setNotice(null);
    try {
      await api("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email, purpose: "verify_email" }) });
      setNotice("A new code is on the way. Check your inbox (and spam).");
    } catch (error) {
      setErr((error as Error).message);
    }
  }

  return (
    <AuthShell title="Verify your email" subtitle="Enter the 6-digit code we emailed you. It expires in 10 minutes.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Verification code</label>
          <input
            className="input tracking-[0.4em] text-center text-lg font-semibold"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            inputMode="numeric"
            required
            autoFocus
          />
        </div>
        <FieldError message={err} />
        <Notice message={notice} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Verifying…" : "Verify & continue"}</button>
      </form>
      <div className="mt-6 flex items-center justify-between text-sm text-ink-500">
        <button onClick={resend} className="hover:text-ink-800">Resend code</button>
        <Link to="/login" className="hover:text-ink-800">Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
