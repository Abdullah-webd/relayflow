import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { EASE_OUT } from "../../components/motion";

// Admin console kit. Motion thesis: "data settles like a ticker" — numbers roll only when they
// change, new rows slide in at the top, panels slide from the edge. Nothing moves on its own.

export class AdminAuthError extends Error {}

/** Shared by every tab: the last successful refresh (for the live indicator) and sign-out. */
export const AdminCtx = createContext<{ markUpdated: (t: number | null) => void; signedOut: () => void; openReports: number; setOpenReports: (n: number) => void }>(null!);
export const useAdmin = () => useContext(AdminCtx);

/** useLive + report the refresh to the header's live indicator + handle an expired session. */
export function useAdminLive<T>(path: string, ms = 10_000) {
  const { markUpdated, signedOut } = useAdmin();
  const live = useLive<T>(path, ms, signedOut);
  useEffect(() => {
    if (live.updatedAt) markUpdated(live.updatedAt);
  }, [live.updatedAt]);
  return live;
}

export async function adminApi<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (opts.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api/admin${path}`, { credentials: "include", ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new AdminAuthError(data.detail || "Signed out");
  if (!res.ok) throw new Error(data.detail || data.error || "Request failed");
  return data as T;
}

/** Fetch now, then every `ms` while the tab is visible (and immediately when it becomes visible). */
export function useLive<T>(path: string, ms = 10_000, onSignedOut?: () => void) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const alive = useRef(true);
  const load = useCallback(async () => {
    try {
      const d = await adminApi<T>(path);
      if (!alive.current) return;
      setData(d);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (e instanceof AdminAuthError) return onSignedOut?.();
      if (alive.current) setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    setData(null);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), ms);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load, ms]);
  return { data, error, updatedAt, reload: load };
}

/** A number that rolls up into place when its value changes (and sits still otherwise). */
export function LiveNumber({ value, format = (n: number) => n.toLocaleString() }: { value: number; format?: (n: number) => string }) {
  return (
    <span className="relative inline-flex overflow-hidden align-bottom tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: "70%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-70%", opacity: 0 }} transition={{ duration: 0.32, ease: EASE_OUT }}>
          {format(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function Stat({ label, value, sub, format, tone }: { label: string; value: number; sub?: ReactNode; format?: (n: number) => string; tone?: "warn" }) {
  return (
    <div className={`rounded-2xl border bg-white px-4 py-3.5 ${tone === "warn" && value > 0 ? "border-amber-200" : "border-line"}`}>
      <div className="text-[12.5px] text-ink-500">{label}</div>
      <div className={`mt-1 font-display text-[26px] font-semibold leading-none tracking-[-0.01em] ${tone === "warn" && value > 0 ? "text-amber-700" : "text-navy"}`}>
        <LiveNumber value={value} format={format} />
      </div>
      {sub && <div className="mt-1.5 truncate text-[12px] text-ink-500">{sub}</div>}
    </div>
  );
}

export const usd = (n: number) => `$${n.toLocaleString()}`;
export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "0%");
export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Round an axis up to a number whose half is also whole. */
const niceTop = (max: number) => {
  for (let p = 1; ; p *= 10) for (const m of [2, 4, 6, 8, 10]) if (m * p >= Math.max(1, max)) return m * p;
};
const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/** Single-series daily bars with a hover tooltip; the title names the series (no legend). */
export function DayBars({ days, values, color = "rgb(var(--brand-600))", height = 150, label }: { days: string[]; values: number[]; color?: string; height?: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceTop(Math.max(...values, 0));
  const every = days.length > 14 ? 7 : days.length > 7 ? 2 : 1;
  return (
    <div>
      <div className="relative flex gap-2.5" aria-hidden>
        <div className="flex w-6 flex-col justify-between text-right text-[10.5px] tabular-nums text-ink-400" style={{ height }}>
          <span>{top}</span>
          <span>{top / 2}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height }}>
            <div className="border-t border-dashed border-line" />
            <div className="border-t border-dashed border-line" />
            <div className="border-t border-line-strong" />
          </div>
          <div className="relative flex items-end gap-[3px]" style={{ height }}>
            {values.map((v, i) => (
              <div key={days[i]} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {hover === i && <div className="absolute inset-y-0 -inset-x-[1px] rounded bg-brand-50/70" />}
                <div className="rf-bar relative w-full rounded-t-[3px]" style={{ height: `${(v / top) * 100}%`, minHeight: v ? 3 : 0, background: color, ["--i" as any]: Math.min(i, 20) }} />
                {hover === i && (
                  <div className={`absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg border border-line bg-white px-2.5 py-1.5 text-[12px] shadow-pop ${i > values.length - 4 ? "right-0" : i < 3 ? "left-0" : "left-1/2 -translate-x-1/2"}`}>
                    <span className="text-ink-500">{shortDay(days[i])}:</span> <span className="font-medium tabular-nums text-ink-900">{v.toLocaleString()}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-[3px] text-[10.5px] text-ink-400">
            {days.map((d, i) => (
              <div key={d} className="flex-1 overflow-visible whitespace-nowrap text-center">
                {i === days.length - 1 ? <span className="font-medium text-ink-700">Today</span> : (days.length - 1 - i) % every === 0 && i > 0 ? shortDay(d) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={d}>
              <td>{d}</td>
              <td>{values[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ranked horizontal bars with direct labels (one series, one hue). */
/** `of` sets what a full bar means (e.g. all accounts for percentages); default is the largest item. */
export function RankBars({ items, format = (n: number) => n.toLocaleString(), color = "rgb(var(--brand-600))", of }: { items: { key: string; label: ReactNode; value: number; sub?: ReactNode }[]; format?: (n: number) => string; color?: string; of?: number }) {
  const max = Math.max(of ?? Math.max(...items.map((i) => i.value)), 1);
  if (!items.length) return <p className="py-6 text-center text-[13px] text-ink-500">No data yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((it, i) => (
        <li key={it.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-ink-800">{it.label}</span>
            <span className="shrink-0 tabular-nums text-ink-600">
              {format(it.value)}
              {it.sub && <span className="ml-1.5 text-ink-400">{it.sub}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface">
            <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${(it.value / max) * 100}%` }} transition={{ duration: 0.7, ease: EASE_OUT, delay: i * 0.04 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Right-side panel for details; slides in from the edge, Esc or backdrop closes it. */
export function Drawer({ open, onClose, title, children, width = "max-w-[560px]" }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div className="absolute inset-0 bg-ink-900/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            className={`relative flex h-full w-full ${width} flex-col border-l border-line bg-white shadow-pop`}
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 32, opacity: 0, transition: { duration: 0.16 } }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div className="min-w-0">{title}</div>
              <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:bg-surface hover:text-ink-700" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-surface" style={{ animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-56 animate-pulse rounded-2xl bg-surface" style={{ animationDelay: `${(i + 4) * 70}ms` }} />
      ))}
    </div>
  );
}

export const SECTION_LABEL: Record<string, string> = {
  overview: "Overview",
  chat: "Chat",
  "auto-replies": "Auto-replies",
  monitors: "Monitors",
  schedules: "Schedules",
  connections: "Connections",
  settings: "Settings",
  reports: "Report a problem",
};

export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useSearch<T>(items: T[] | undefined, q: string, keys: (t: T) => string) {
  return useMemo(() => (items ?? []).filter((x) => !q || keys(x).toLowerCase().includes(q.toLowerCase())), [items, q]);
}
