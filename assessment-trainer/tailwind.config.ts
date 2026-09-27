import type { Config } from "tailwindcss";

const v = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: v("background"),
        foreground: v("foreground"),
        card: v("card"),
        muted: { DEFAULT: v("muted"), foreground: v("muted-foreground") },
        border: v("border"),
        primary: { DEFAULT: v("primary"), foreground: v("primary-foreground") },
        accent: v("accent"),
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
      },
      borderRadius: { lg: "0.75rem", md: "0.5rem" },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["ui-monospace", "SFMono-Regular", "monospace"] },
    },
  },
  plugins: [],
};
export default config;
