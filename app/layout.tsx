import type { Metadata, Viewport } from "next";
import { Amiri } from "next/font/google";
import "./globals.css";
import UpdateChecker from "@/components/UpdateChecker";

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dugsi — Recite & Learn the Quran",
  description:
    "Recite Surah Al-Fatiha and get instant, free, word-by-word accuracy and tajweed feedback — right on your device.",
  applicationName: "Dugsi",
  appleWebApp: { capable: true, title: "Dugsi", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#08332f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={amiri.variable}>
      <body>
        {children}
        <UpdateChecker />
      </body>
    </html>
  );
}
