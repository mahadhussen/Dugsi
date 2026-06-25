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
        ink: "#0f1b2d",
        parchment: "#fbf7ee",
        gold: "#c9a24b",
        emerald: "#0f766e",
      },
    },
  },
  plugins: [],
};

export default config;
