import { Link } from "react-router-dom";
import { type ReactNode } from "react";
import { Logo } from "../../components/Logo";

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-white flex flex-col">
      <header className="px-6 py-5">
        <Link to="/">
          <Logo byline />
        </Link>
      </header>
      <main className="flex-1 grid place-items-center px-4 pb-16">
        <div className="w-full max-w-[420px]">
          <h1 className="text-[28px] font-bold text-ink-900 tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-500 text-[15px] leading-relaxed">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="mt-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm px-3 py-2">{message}</div>;
}

export function Notice({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-3 py-2">{message}</div>;
}

// Shown on every OTP page — tells people exactly where to look so they don't miss the code.
export function SpamTip() {
  return (
    <div className="mt-4 rounded-xl bg-brand-50 border border-brand-100 text-brand-800 text-[13px] px-3.5 py-3 leading-relaxed">
      📩 <b>Didn't get the email?</b> Check your <b>Spam</b> and <b>Promotions</b> folders as well as your inbox — it can take a minute to arrive. If you find it in Spam, tap <b>“Not spam”</b> so the next ones reach your inbox.
    </div>
  );
}
