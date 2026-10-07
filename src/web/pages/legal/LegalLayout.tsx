import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/Logo";

// Shared facts for the legal pages. Update LEGAL_UPDATED together with TERMS_VERSION in
// src/server/legal.ts whenever the Terms or Privacy Policy change materially.
export const LEGAL_UPDATED = "October 7, 2026";
export const OPERATOR = "Ajala Abdullah";
export const CONTACT_PHONE = "+44 7405 655419";
export const CONTACT_TEL = "+447405655419";

export function LegalLayout({ title, intro, toc, children }: { title: string; intro: ReactNode; toc: { id: string; label: string }[]; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · RelayFlow`;
    window.scrollTo(0, 0);
  }, [title]);

  return (
    <div className="min-h-full bg-white text-ink-800">
      <header className="border-b border-line">
        <div className="mx-auto max-w-container px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" aria-label="RelayFlow home">
            <Logo byline />
          </Link>
          <Link to="/" className="text-[14px] font-medium text-ink-600 hover:text-ink-900 transition-colors">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-container px-5 sm:px-6 py-14 sm:py-20">
        <div className="grid lg:grid-cols-12 gap-12">
          <aside className="hidden lg:block lg:col-span-3">
            <nav aria-label="On this page" className="sticky top-8">
              <p className="text-[12px] font-medium text-ink-500">On this page</p>
              <ul className="mt-3 space-y-2 text-[13px]">
                {toc.map((t) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`} className="text-ink-600 hover:text-ink-900 transition-colors">
                      {t.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="lg:col-span-8 lg:col-start-5 max-w-[68ch] legal">
            <h1 className="text-display-sm sm:text-display-md font-semibold text-ink-900">{title}</h1>
            <p className="mt-3 text-[14px] text-ink-500">Last updated {LEGAL_UPDATED}</p>
            <div className="mt-8 text-lead text-ink-600">{intro}</div>
            {children}
            <div className="mt-16 pt-6 border-t border-line text-[14px] text-ink-500">
              Questions? Call {OPERATOR} on{" "}
              <a href={`tel:${CONTACT_TEL}`} className="font-medium text-brand-700 hover:text-brand-800">
                {CONTACT_PHONE}
              </a>
              . See also our{" "}
              {title.startsWith("Privacy") ? (
                <Link to="/terms" className="font-medium text-brand-700 hover:text-brand-800">Terms of Service</Link>
              ) : (
                <Link to="/privacy" className="font-medium text-brand-700 hover:text-brand-800">Privacy Policy</Link>
              )}
              .
            </div>
          </article>
        </div>
      </main>
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-12">
      <h2 className="text-[20px] font-semibold tracking-[-0.015em] text-ink-900">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-7 text-ink-700">{children}</div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-2 marker:text-ink-400">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
