import type { Metadata } from "next";
import { Amiri } from "next/font/google";
import "./globals.css";

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dugsi — Quran Recitation & Tajweed Trainer",
  description:
    "Recite Surah Al-Fatiha and get instant word-by-word accuracy and tajweed feedback.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={amiri.variable}>
      <body>{children}</body>
    </html>
  );
}
