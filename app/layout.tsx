import type { Metadata, Viewport } from "next";
import { Amiri } from "next/font/google";
import "./globals.css";
import UpdateChecker from "@/components/UpdateChecker";
import AppNav from "@/components/AppNav";
import { AuthProvider } from "@/lib/supabase/AuthProvider";
import AppServices from "@/components/AppServices";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dugsi — Recite & Learn the Quran",
  description:
    "Recite any surah and get instant, free, word-by-word feedback: live mistake detection, memorisation mode with peeking, mistake history, recordings, goals, reminders and progress that syncs across devices.",
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
      <head>
        <link rel="manifest" href={`${BASE}/manifest.webmanifest`} />
        <link rel="apple-touch-icon" href={`${BASE}/icons/icon-192.png`} />
      </head>
      <body>
        <AuthProvider>
          <AppNav />
          {children}
          <UpdateChecker />
          <AppServices />
        </AuthProvider>
      </body>
    </html>
  );
}
