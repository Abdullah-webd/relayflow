import { motion, AnimatePresence, type HTMLMotionProps } from "motion/react";
import { useEffect, type ReactNode } from "react";

// App motion vocabulary (dial 4: fast, purposeful, never blocks input).
// "Things arrive like messages: a quick lift from below and a soft settle."
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const SPRING = { type: "spring", duration: 0.35, bounce: 0.1 } as const;

/** A list row that lifts in. `index` staggers the first few rows on first load only. */
export function Rise({ index = 0, stagger = true, className, children, ...rest }: { index?: number; stagger?: boolean; className?: string; children: ReactNode } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.15 } }}
      transition={{ duration: 0.22, ease: EASE_OUT, delay: stagger ? Math.min(index, 8) * 0.035 : 0 }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Centered dialog with a fading backdrop; scales in from 0.96, exits faster. */
export function Dialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-ink-900/40 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small popover/menu that grows from its trigger corner. */
export function Pop({ open, origin = "top right", className, children }: { open: boolean; origin?: string; className?: string; children: ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={className}
          style={{ transformOrigin: origin }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
          transition={{ duration: 0.16, ease: EASE_OUT }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Loading placeholder rows shaped like the content they replace. */
export function SkeletonRows({ rows = 4, className = "h-12" }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${className} rounded-xl bg-surface animate-pulse`} style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}
