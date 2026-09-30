import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell, { FieldError } from "./AuthShell";
import { api } from "../../lib/api";

export default function Signup() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!accepted) {
      setTermsError(true);
      document.getElementById("accept-terms")?.focus();
      return;
    }
    setBusy(true);
    try {
      await api("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password, acceptTerms: true }) });
      nav("/verify", { state: { email } });
    } catch (error) {
      setErr((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your workspace" subtitle="Start your 1-day free trial. No credit card required.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="At least 8 characters"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label htmlFor="accept-terms" className="flex items-start gap-3 cursor-pointer select-none">
            <input
              id="accept-terms"
              type="checkbox"
              checked={accepted}
              onChange={(e) => {
                setAccepted(e.target.checked);
                if (e.target.checked) setTermsError(false);
              }}
              aria-invalid={termsError}
              aria-describedby={termsError ? "terms-error" : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-brand-600 cursor-pointer"
            />
            <span className="text-[14px] leading-relaxed text-ink-600">
              I agree to the{" "}
              <Link to="/terms" target="_blank" className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-200">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" target="_blank" className="font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2 decoration-brand-200">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {termsError && (
            <p id="terms-error" role="alert" className="mt-2 pl-7 text-[13px] text-red-600">
              Please agree to the Terms of Service and Privacy Policy to continue.
            </p>
          )}
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
