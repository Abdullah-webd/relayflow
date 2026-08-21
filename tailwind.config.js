/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/web/index.html", "./src/web/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef1ff",
          100: "#e0e5ff",
          200: "#c6ccff",
          300: "#a3a8fc",
          400: "#8380f6",
          500: "#635bf7",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#2e2a76",
        },
        accent: {
          400: "#22c1d6",
          500: "#12b0c9",
          600: "#0e8fa6",
        },
        ink: {
          900: "#101828",
          800: "#1d2939",
          700: "#344054",
          600: "#475467",
          500: "#667085",
          400: "#98a2b3",
        },
        line: "#e7eaf0",
        surface: "#f7f8fb",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 8px 28px rgba(16,24,40,.05)",
        pop: "0 12px 40px rgba(16,24,40,.14)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
    },
  },
  plugins: [],
};
