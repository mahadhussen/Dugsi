"use client";

import { useEffect, useState } from "react";
import Reciter from "./Reciter";
import SurahPicker from "./SurahPicker";
import { surahMeta, loadSurah, type Surah } from "@/lib/quran";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadFurthest, resetFurthest } from "@/lib/supabase/progress";

export default function QuranTrainer() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [surahId, setSurahId] = useState(1);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [loading, setLoading] = useState(true);

  const [resumeVerse, setResumeVerse] = useState(0);

  const meta = surahMeta(surahId)!;
  const isLong = meta.ayahCount > 10;
  const trackProgress = isLong;

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

  // Show where the reader left off (from their account, or this device).
  useEffect(() => {
    if (!trackProgress || !surah) {
      setResumeVerse(0);
      return;
    }
    let cancelled = false;
    loadFurthest(userId, surahId).then((v) => !cancelled && setResumeVerse(v));
    return () => {
      cancelled = true;
    };
  }, [trackProgress, surah, surahId, userId]);

  const selectSurah = (id: number) => {
    if (id === surahId) return;
    setSurahId(id);
    setSurah(null);
    // Jump back to the top when switching surah.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // The progress panel's "Practice" buttons jump straight to a surah.
  useEffect(() => {
    const go = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      if (typeof id === "number") selectSurah(id);
    };
    window.addEventListener("dugsi:goto-surah", go as EventListener);
    return () => window.removeEventListener("dugsi:goto-surah", go as EventListener);
    // selectSurah closes over surahId; re-bind when it changes.
  }, [surahId]);

  const startOver = () => {
    if (trackProgress) resetFurthest(userId, surahId);
    setResumeVerse(0);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      {/* Surah picker (all 114) */}
      <SurahPicker current={surahId} onSelect={selectSurah} />

      <p className="text-center text-sm text-ink/60">
        {isLong
          ? "Scroll to read · recite any part (only that part is scored) · tap ▶ to hear a qari."
          : "Recite aloud, or tap ▶ to hear a qari."}
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
        <Reciter ayat={surah.ayat} surahNumber={surahId} trackProgress={trackProgress} />
      )}
    </div>
  );
}
