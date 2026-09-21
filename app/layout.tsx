import type { Metadata, Viewport } from "next";
import { Amiri, Amiri_Quran } from "next/font/google";
import "./globals.css";
import UpdateChecker from "@/components/UpdateChecker";
import AppNav from "@/components/AppNav";
import BottomNav from "@/components/BottomNav";
import { AuthProvider } from "@/lib/supabase/AuthProvider";
import AppServices from "@/components/AppServices";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-arabic",
  display: "swap",
});

// A typeface drawn for the mushaf itself (SIL OFL), used for the Quran text.
const amiriQuran = Amiri_Quran({
  subsets: ["arabic"],
  weight: "400",
  variable: "--font-quran",
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
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${amiri.variable} ${amiriQuran.variable}`}>
      <head>
        {/* Apply the saved theme before first paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var s=JSON.parse(localStorage.getItem("dugsi:settings:v1")||"{}");if(s.theme==="dark")document.documentElement.dataset.theme="dark";}catch(e){}',
          }}
        />
        <link rel="manifest" href={`${BASE}/manifest.webmanifest`} />
        <link rel="apple-touch-icon" href={`${BASE}/icons/icon-192.png`} />
      </head>
      <body>
        <AuthProvider>
          <AppNav />
          <div className="pb-20">{children}</div>
          <BottomNav />
          <UpdateChecker />
          <AppServices />
        </AuthProvider>
      </body>
    </html>
  );
}
