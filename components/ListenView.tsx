"use client";

import { useEffect, useState } from "react";
import SurahPicker from "./SurahPicker";
import ReciterPicker from "./ReciterPicker";
import ListenPlayer from "./ListenPlayer";
import SurahView from "./SurahView";
import { loadSurah, surahMeta, type Surah } from "@/lib/quran";

/** The "just listen" experience: pick a surah and a Sheikh, then play through
 *  the whole Quran verse by verse while reading along. No microphone. */
export default function ListenView() {
  const [surahId, setSurahId] = useState(1);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [loading, setLoading] = useState(true);

  const meta = surahMeta(surahId)!;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadSurah(surahId)
      .then((s) => {
        if (!cancelled) {
          setSurah(s);
          setLoading(false);
        }
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [surahId]);

  const selectSurah = (id: number) => {
    if (id === surahId) return;
    setSurahId(id);
    setSurah(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <SurahPicker current={surahId} onSelect={selectSurah} />
        <ReciterPicker />
      </div>

      {/* Hands-free player: plays the whole surah, then flows into the next. */}
      <ListenPlayer surahId={surahId} onSurahChange={selectSurah} />

      <p className="text-center text-xs text-ink/55">
        Surah {meta.id} · {meta.ayahCount} verser · tryck ▶ ovan för att lyssna, eller ▶ vid en
        enskild vers.
      </p>

      {/* Read along */}
      {loading || !surah ? (
        <div className="flex justify-center py-10 text-ink/60">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        </div>
      ) : (
        <div className="rounded-2xl border border-gold/20 bg-white/70 px-4 shadow-soft">
          <SurahView ayat={surah.ayat} surahNumber={surahId} showTajweed />
        </div>
      )}
    </div>
  );
}
