import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, AlertTriangle, Info } from "lucide-react";
import { ChannelMark, type Channel } from "./ChannelMark";
import { Dialog, EASE_OUT, SPRING } from "./motion";

// App UI kit (dashboard). Calm, dense, keyboard-friendly; motion is fast and only confirms state.

export const PLATFORM_LABEL: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram", slack: "Slack", gmail: "Gmail" };
// Chart-safe channel colors (validated for color-blind separation and 3:1 contrast on white).
export const PLATFORM_COLOR: Record<string, string> = { whatsapp: "#1FA855", telegram: "#1E8BC3", slack: "#8E3B8F", gmail: "#D93025" };

/** "just now", "5m ago", "3h ago", "Yesterday", "12 Oct". */
export function ago(input: string | Date | null | undefined): string {
  if (!input) return "never";
  const d = new Date(input);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 172800) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "Today 09:00", "Tomorrow 09:00", "Mon 12 Oct, 09:00". */
export function when(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const d = new Date(input);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const day = new Date(d).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  if (day === today) return `Today ${time}`;
  if (day - today === 864e5) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-6">
      <div className="min-w-0">
        {back}
        <h1 className="font-display text-[26px] leading-[1.15] font-semibold tracking-[-0.02em] text-navy">{title}</h1>
        {description && <p className="mt-1.5 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A content region with an optional heading row. Hairline border, no shadow: hierarchy comes from type. */
export function Panel({ title, description, action, children, className = "", bodyClass = "p-5" }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-white ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[14.5px] font-semibold text-ink-900">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/** On/off switch. The thumb springs across; the track color changes with it. */
export function Switch({ checked, onChange, label, disabled, size = "md" }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; size?: "sm" | "md" }) {
  const w = size === "sm" ? "w-8 h-[18px]" : "w-10 h-[22px]";
  const t = size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex ${w} shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-brand-600 justify-end" : "bg-ink-300 justify-start"
      }`}
    >
      <motion.span layout transition={SPRING} className={`${t} rounded-full bg-white shadow-[0_1px_2px_rgb(18_21_27/0.25)]`} />
    </button>
  );
}

const TONES = {
  live: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  idle: "bg-surface text-ink-600 ring-ink-900/5",
  warn: "bg-amber-50 text-amber-800 ring-amber-600/20",
  bad: "bg-red-50 text-red-700 ring-red-600/15",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/15",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "idle", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${tone === "live" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : tone === "bad" ? "bg-red-500" : "bg-ink-400"}`} />}
      {children}
    </span>
  );
}

/** Channel logo on its brand color (the only place channel colors fill a shape). */
export function ChannelIcon({ platform, size = 28 }: { platform: string; size?: number }) {
  const known = ["whatsapp", "telegram", "slack", "gmail"].includes(platform);
  return (
    <span className="grid shrink-0 place-items-center rounded-[8px] text-white" style={{ width: size, height: size, background: PLATFORM_COLOR[platform] || "rgb(var(--ink-500))" }} title={PLATFORM_LABEL[platform]}>
      {known && <ChannelMark channel={platform as Channel} size={Math.round(size * 0.56)} />}
    </span>
  );
}

export function EmptyState({ title, children, action, art }: { title: string; children?: ReactNode; action?: ReactNode; art?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="mx-auto max-w-md px-6 py-12 text-center">
      {art}
      <h3 className="text-[16px] font-semibold text-ink-900">{title}</h3>
      {children && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{children}</p>}
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </motion.div>
  );
}

/** Confirmation for destructive actions. */
export function Confirm({ open, title, body, confirmLabel = "Delete", onConfirm, onClose }: { open: boolean; title: string; body?: ReactNode; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <div className="w-[min(92vw,420px)] rounded-2xl border border-line bg-white p-6 shadow-pop">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-900">{title}</h3>
            {body && <div className="mt-1 text-[14px] text-ink-500">{body}</div>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost h-9">Cancel</button>
          <button onClick={onConfirm} className="btn h-9 bg-red-600 text-white hover:bg-red-700" autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** Segmented control; the active highlight slides between options. */
export function Segmented<T extends string>({ value, onChange, options, id }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; id: string }) {
  return (
    <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-lg bg-surface p-0.5 ring-1 ring-inset ring-line">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="tab" aria-selected={active} onClick={() => onChange(o.value)} className={`relative h-8 shrink-0 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors ${active ? "text-ink-900" : "text-ink-500 hover:text-ink-800"}`}>
            {active && <motion.span layoutId={`seg-${id}`} transition={SPRING} className="absolute inset-0 rounded-md bg-white shadow-xs ring-1 ring-line" />}
            <span className="relative inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- Toasts ----
type ToastTone = "ok" | "error" | "info";
interface ToastItem { id: number; text: string; tone: ToastTone }
const ToastCtx = createContext<(text: string, tone?: ToastTone) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const push = useCallback((text: string, tone: ToastTone = "ok") => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col items-end gap-2">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-navy px-3.5 py-2.5 text-[13.5px] text-white shadow-pop"
            >
              {t.tone === "ok" ? <Check size={16} className="shrink-0 text-emerald-300" /> : t.tone === "error" ? <X size={16} className="shrink-0 text-red-300" /> : <Info size={16} className="shrink-0 text-brand-200" />}
              <span>{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/** Close on Escape / outside click for small popovers. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);
  return ref;
}

/** Consistent page frame: scrolls, centers, sets the reading width. */
export function Page({ children, width = "max-w-[1120px]" }: { children: ReactNode; width?: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={`mx-auto ${width} px-4 pb-16 pt-7 sm:px-8`}>{children}</div>
    </div>
  );
}
