export function Logo({ size = 34, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-extrabold text-ink-900 text-lg tracking-tight">
      <span
        className="grid place-items-center rounded-xl text-white"
        style={{ width: size, height: size, background: "linear-gradient(135deg,#22c1d6,#4f46e5)" }}
      >
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.4" />
          <circle cx="18" cy="6" r="2.4" />
          <circle cx="18" cy="18" r="2.4" />
          <path d="M8.1 11 15.4 7.2M8.1 13l7.3 3.8" />
        </svg>
      </span>
      {showText && <span>RelayFlow</span>}
    </span>
  );
}
