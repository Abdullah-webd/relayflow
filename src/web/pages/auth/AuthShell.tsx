import { Link } from "react-router-dom";
import { type ReactNode } from "react";
import { Logo } from "../../components/Logo";

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-white flex flex-col">
      <header className="px-6 py-5">
        <Link to="/">
          <Logo />
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
