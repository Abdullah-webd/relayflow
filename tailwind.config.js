/** @type {import('tailwindcss').Config} */
// Design tokens live as CSS variables in src/web/index.css (RGB channels so Tailwind
// opacity modifiers like bg-brand-500/10 keep working). This file only maps names.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/web/index.html", "./src/web/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand = the logo color: primary buttons, links, focus, active states.
        brand: {
          50: v("brand-50"),
          100: v("brand-100"),
          200: v("brand-200"),
          300: v("brand-300"),
          400: v("brand-400"),
          500: v("brand-500"),
          600: v("brand-600"),
          700: v("brand-700"),
          800: v("brand-800"),
          900: v("brand-900"),
        },
        accent: { 400: v("accent-400"), 500: v("accent-500"), 600: v("accent-600") },
        // Cool-tinted neutrals.
        ink: {
          900: v("ink-900"),
          800: v("ink-800"),
          700: v("ink-700"),
          600: v("ink-600"),
          500: v("ink-500"),
          400: v("ink-400"),
          300: v("ink-300"),
          200: v("ink-200"),
        },
        canvas: v("canvas"),
        surface: v("surface"),
        line: { DEFAULT: v("line"), strong: v("line-strong") },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // Display steps: tracking and line-height tighten as size grows.
        "display-xl": ["4.5rem", { lineHeight: "1.02", letterSpacing: "-0.038em" }],
        "display-lg": ["3.5rem", { lineHeight: "1.04", letterSpacing: "-0.032em" }],
        "display-md": ["2.5rem", { lineHeight: "1.1", letterSpacing: "-0.026em" }],
        "display-sm": ["2rem", { lineHeight: "1.15", letterSpacing: "-0.022em" }],
        title: ["1.375rem", { lineHeight: "1.3", letterSpacing: "-0.012em" }],
        lead: ["1.125rem", { lineHeight: "1.6", letterSpacing: "-0.005em" }],
      },
      borderRadius: {
        lg: "8px",
        xl: "10px",
        "2xl": "12px",
        "3xl": "16px",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        card: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        pop: "var(--shadow-lg)",
        frame: "var(--shadow-frame)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.23, 1, 0.32, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-out": "cubic-bezier(0.77, 0, 0.175, 1)",
      },
      maxWidth: {
        container: "1200px",
      },
    },
  },
  plugins: [],
};
