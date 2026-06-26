import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        arabic: ["var(--font-arabic)", "Amiri", "Scheherazade New", "serif"],
      },
      colors: {
        ink: "#10241f",
        parchment: "#faf6ec",
        gold: {
          DEFAULT: "#c9a24b",
          soft: "#e3c987",
          deep: "#a9842f",
        },
        emerald: {
          DEFAULT: "#0f766e",
          deep: "#0b4f4a",
          dark: "#08332f",
        },
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(8, 51, 47, 0.35)",
        glow: "0 0 0 6px rgba(201, 162, 75, 0.18)",
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
