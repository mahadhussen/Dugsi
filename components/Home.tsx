"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { surahMeta } from "@/lib/quran";
import { useReading, setReading, type Mode } from "@/lib/reading-store";
import { useReciter } from "@/lib/reciter-store";
import { STYLE_LABEL } from "@/lib/audio-quran";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadStats, type Stats } from "@/lib/supabase/progress";
import { nextPrayer, formatTime } from "@/lib/prayer-times";
import ReciterAvatar from "./ReciterAvatar";
import SurahPicker from "./SurahPicker";
import ReciterPicker from "./ReciterPicker";
import { NavIcon } from "./BottomNav";
import { LogoMark } from "./Logo";

/**
 * The front door, in three big steps anyone can follow: pick a surah, pick a
 * Sheikh, then Listen or Recite. Nothing else competes for attention.
 */
export default function Home() {
  const router = useRouter();
  const reading = useReading();
  const { reciter } = useReciter();
  const { user } = useAuth();
  const meta = surahMeta(reading.surah)!;

  const [stats, setStats] = useState<Stats | null>(null);
  const [prayer, setPrayer] = useState<string | null>(null);
  useEffect(() => {
    void loadStats(user?.id ?? null).then(setStats);
  }, [user]);
  useEffect(() => {
    const np = nextPrayer(new Date());
    setPrayer(`${np.slot.label} ${formatTime(np.slot.time)}`);
  }, []);

  const go = (mode: Mode) => {
    setReading({ mode });
    router.push("/quran");
  };

  const minutes = stats ? Math.round(stats.todaySeconds / 60) : 0;

  return (
    <main className="mx-auto max-w-xl px-4 pb-8 pt-6">
      <SurahPicker current={reading.surah} onSelect={(id) => setReading({ surah: id, verse: undefined })} />
      <ReciterPicker />

      <div className="flex items-center justify-center gap-3">
        <LogoMark size={52} />
        <div className="leading-tight">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Dugsi</h1>
          <p className="text-sm font-semibold text-ink/60">Learn to recite the Quran</p>
        </div>
      </div>

      <ol className="mt-7 space-y-4">
        {/* 1. Surah */}
        <li>
          <button
            onClick={() => window.dispatchEvent(new Event("dugsi:open-picker"))}
            className="card flex w-full items-center gap-4 p-4 text-left transition hover:border-emerald/50"
          >
            <StepNumber n={1} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold uppercase tracking-wide text-ink/50">Surah</span>
              <span className="block text-xl font-extrabold leading-tight text-ink">{meta.transliteration}</span>
              <span className="block text-sm font-semibold text-ink/60">
                Surah {meta.id} · {meta.ayahCount} verses
              </span>
            </span>
            <span className="ayah max-w-[38%] shrink-0 truncate text-2xl text-emerald-bright" dir="rtl">
              {meta.nameArabic}
            </span>
            <NavIcon name="chevron" className="h-6 w-6 shrink-0 text-ink/40" />
          </button>
        </li>

        {/* 2. Sheikh */}
        <li>
          <button
            onClick={() => window.dispatchEvent(new Event("dugsi:open-reciters"))}
            className="card flex w-full items-center gap-4 p-4 text-left transition hover:border-emerald/50"
          >
            <StepNumber n={2} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold uppercase tracking-wide text-ink/50">Sheikh</span>
              <span className="block text-xl font-extrabold leading-tight text-ink">{reciter.name}</span>
              <span className="block truncate text-sm font-semibold text-ink/60">
                {STYLE_LABEL[reciter.style]} · {reciter.country}
              </span>
            </span>
            <ReciterAvatar reciter={reciter} size={56} />
            <NavIcon name="chevron" className="h-6 w-6 shrink-0 text-ink/40" />
          </button>
        </li>

        {/* 3. Listen or recite */}
        <li className="card p-4">
          <div className="mb-3 flex items-center gap-4">
            <StepNumber n={3} />
            <span className="text-sm font-bold uppercase tracking-wide text-ink/50">What would you like to do?</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => go("listen")} className="btn-outline flex-col gap-1 py-4">
              <NavIcon name="play" className="h-9 w-9" />
              Listen
            </button>
            <button onClick={() => go("recite")} className="btn-primary flex-col gap-1 py-4">
              <NavIcon name="mic" className="h-9 w-9" />
              Recite
            </button>
          </div>
          <p className="mt-3 text-center text-sm font-semibold text-ink/55">
            Listen: the Sheikh reads and the words turn green. Recite: you read aloud and each word turns green, yellow or red.
          </p>
        </li>
      </ol>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href="/progress" className="card flex items-center gap-3 px-4 py-3 transition hover:border-emerald/50">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald/15 text-emerald-bright">
            <NavIcon name="star" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold uppercase tracking-wide text-ink/50">Today</span>
            <span className="block truncate text-base font-bold text-ink">
              {stats && stats.totalSessions > 0
                ? `${minutes} min recited · ${stats.streak} day streak`
                : "Nothing yet. Recite to start a streak."}
            </span>
          </span>
          <NavIcon name="chevron" className="h-5 w-5 text-ink/40" />
        </Link>
        <Link href="/prayer" className="card flex items-center gap-3 px-4 py-3 transition hover:border-emerald/50">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald/15 text-emerald-bright">
            <NavIcon name="clock" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold uppercase tracking-wide text-ink/50">Next prayer</span>
            <span className="block truncate text-base font-bold text-ink">{prayer ?? "…"}</span>
          </span>
          <NavIcon name="chevron" className="h-5 w-5 text-ink/40" />
        </Link>
      </div>

      <p className="mt-8 text-center text-sm font-semibold text-ink/45">
        Free, no ads. Your voice stays on your device.{" "}
        <Link href="/about" className="underline underline-offset-2 hover:text-ink">
          About &amp; sources
        </Link>
      </p>
    </main>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald text-xl font-extrabold text-white">
      {n}
    </span>
  );
}
