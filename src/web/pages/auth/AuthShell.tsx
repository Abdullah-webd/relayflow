import { Link } from "react-router-dom";
import { type ReactNode } from "react";
import { CircleAlert, CircleCheck, Mail } from "lucide-react";
import { Logo } from "../../components/Logo";

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-white flex flex-col">
      <header className="px-5 sm:px-8 h-16 flex items-center">
        <Link to="/" aria-label="RelayFlow home">
          <Logo byline />
        </Link>
      </header>
      <main className="flex-1 grid place-items-center px-5 pt-6 pb-20">
        <div className="w-full max-w-[400px] rf-in">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.022em] text-ink-900">{title}</h1>
          {subtitle && <p className="mt-2.5 text-[15px] leading-relaxed text-ink-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <footer className="px-5 pb-8 text-center text-[12px] text-ink-400">© {new Date().getFullYear()} RelayFlow</footer>
    </div>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
      <CircleAlert size={15} className="mt-px shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function Notice({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-800">
      <CircleCheck size={15} className="mt-px shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// Shown on every OTP page — tells people exactly where to look so they don't miss the code.
export function SpamTip() {
  return (
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-ink-600">
      <Mail size={16} className="mt-0.5 shrink-0 text-ink-500" />
      <p>
        <span className="font-medium text-ink-900">Didn’t get the email?</span> Check your Spam and Promotions folders too. It can take a
        minute to arrive. If it’s in Spam, mark it “Not spam” so future codes reach your inbox.
      </p>
    </div>
  );
}
