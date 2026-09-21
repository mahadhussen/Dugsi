import type { Config } from "tailwindcss";

// Design tokens come from CSS variables (see app/globals.css) so the whole app
// can switch between the light mushaf theme (default, like a printed page) and
// a dark theme without touching a single class name.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        arabic: ["var(--font-arabic)", "Amiri", "Scheherazade New", "serif"],
        quran: ["var(--font-quran)", "var(--font-arabic)", "Amiri", "serif"],
      },
      colors: {
        ink: v("--c-ink"),
        shell: v("--c-shell"),
        surface: v("--c-surface"),
        "surface-2": v("--c-surface-2"),
        parchment: v("--c-surface"),
        paper: v("--c-paper"),
        "paper-deep": v("--c-paper-deep"),
        "paper-ink": v("--c-paper-ink"),
        gold: {
          DEFAULT: "#cfae5e",
          soft: v("--c-gold-soft"),
          deep: "#a9842f",
        },
        emerald: {
          DEFAULT: "#159f78",
          bright: v("--c-emerald-bright"),
          deep: "#0f7a5c",
          dark: "#0d1613",
        },
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgb(var(--c-shadow) / 0.35)",
        glow: "0 0 0 6px rgba(21, 159, 120, 0.18)",
      },
      keyframes: {
        ring: {
          "0%": { transform: "scale(1)", opacity: "0.7" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        floatin: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        ring: "ring 1.6s ease-out infinite",
        floatin: "floatin 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
