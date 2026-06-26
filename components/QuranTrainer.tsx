"use client";

import { useEffect, useState } from "react";
import Reciter from "./Reciter";
import { SURAHS, surahMeta, loadSurah, type Surah } from "@/lib/quran";

export default function QuranTrainer() {
  const [surahId, setSurahId] = useState(1);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [loading, setLoading] = useState(true);

  const [resumeVerse, setResumeVerse] = useState(0);

  const meta = surahMeta(surahId)!;
  const isLong = meta.ayahCount > 10;
  const progressKey = isLong ? `dugsi:progress:${surahId}` : undefined;

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

  // Show where the reader left off (read once the surah is loaded).
  useEffect(() => {
    if (!progressKey || !surah) {
      setResumeVerse(0);
      return;
    }
    try {
      setResumeVerse(Number(localStorage.getItem(progressKey)) || 0);
    } catch {
      setResumeVerse(0);
    }
  }, [progressKey, surah]);

  const selectSurah = (id: number) => {
    if (id === surahId) return;
    setSurahId(id);
    setSurah(null);
    // Jump back to the top when switching surah.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startOver = () => {
    if (progressKey) {
      try {
        localStorage.removeItem(progressKey);
      } catch {
        /* ignore */
      }
    }
    setResumeVerse(0);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      {/* Surah picker */}
      <div className="flex flex-wrap justify-center gap-2">
        {SURAHS.map((s) => (
          <button
            key={s.id}
            onClick={() => selectSurah(s.id)}
            className={`rounded-xl border px-4 py-2 text-left transition ${
              s.id === surahId
                ? "border-emerald bg-emerald text-white shadow-soft"
                : "border-gold/30 bg-white/70 text-ink hover:border-emerald/40"
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">{s.transliteration}</span>
              <span className="ayah text-lg" dir="rtl">
                {s.nameArabic}
              </span>
            </div>
            <div className={`text-xs ${s.id === surahId ? "text-white/70" : "text-ink/50"}`}>
              {s.ayahCount} {s.ayahCount === 1 ? "verse" : "verses"}
            </div>
          </button>
        ))}
      </div>

      <p className="text-center text-sm text-ink/60">
        Practising <span className="font-semibold text-ink">{meta.transliteration}</span>.
        {isLong ? " Scroll to read — recite any part and only that part is scored." : ""}
      </p>

      {resumeVerse > 1 && (
        <p className="text-center text-xs text-ink/55">
          Continuing from verse {resumeVerse}.{" "}
          <button onClick={startOver} className="underline underline-offset-2 hover:text-ink">
            Start from the beginning
          </button>
        </p>
      )}

      {loading || !surah ? (
        <div className="flex justify-center py-10 text-ink/60">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        </div>
      ) : (
        <Reciter ayat={surah.ayat} progressKey={progressKey} />
      )}
    </div>
  );
}
