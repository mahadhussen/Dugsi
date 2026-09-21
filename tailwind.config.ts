import type { Config } from "tailwindcss";

// Design tokens. The app shell is dark (Tarteel-like); the mushaf itself is a
// cream "paper" page so the Quran text reads like a printed page.
const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        arabic: ["var(--font-arabic)", "Amiri", "Scheherazade New", "serif"],
        quran: ["var(--font-quran)", "var(--font-arabic)", "Amiri", "serif"],
      },
      colors: {
        // Foreground on the dark shell (was the dark "ink" on parchment).
        ink: "#e9efec",
        // Shell + surfaces.
        shell: "#0b100e",
        surface: "#131a17",
        "surface-2": "#1a2320",
        parchment: "#131a17",
        // The mushaf paper and its ink.
        paper: "#f6efdf",
        "paper-deep": "#eadfc6",
        "paper-ink": "#1c1a14",
        gold: {
          DEFAULT: "#cfae5e",
          soft: "#e6cf8f",
          deep: "#a9842f",
        },
        emerald: {
          DEFAULT: "#159f78",
          bright: "#4fd8a8",
          deep: "#0f7a5c",
          dark: "#0d1613",
        },
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(0, 0, 0, 0.6)",
        glow: "0 0 0 6px rgba(79, 216, 168, 0.18)",
        paper: "0 20px 60px -20px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(169,132,47,0.25)",
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
