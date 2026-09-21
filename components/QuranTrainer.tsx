"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Reciter from "./Reciter";
import SurahPicker from "./SurahPicker";
import VerseRange, { type Range } from "./VerseRange";
import { surahMeta, loadSurah, type Surah } from "@/lib/quran";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadFurthest, resetFurthest } from "@/lib/supabase/progress";

/** Where to go, from the progress page (bookmarks, mistakes) or a URL. */
export interface GotoTarget {
  surah: number;
  /** Scroll to this verse. */
  verse?: number;
  /** Practise only this verse range. */
  from?: number;
  to?: number;
}

function parseGotoFromUrl(): GotoTarget | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const surah = Number(q.get("surah"));
  if (!surah || surah < 1 || surah > 114) return null;
  const num = (k: string) => {
    const v = Number(q.get(k));
    return v > 0 ? v : undefined;
  };
  return { surah, verse: num("verse"), from: num("from"), to: num("to") };
}

export default function QuranTrainer() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [surahId, setSurahId] = useState(1);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range | null>(null);
  const [startVerse, setStartVerse] = useState<number | undefined>(undefined);

  const [resumeVerse, setResumeVerse] = useState(0);

  const meta = surahMeta(surahId)!;
  const isLong = meta.ayahCount > 10;
  // A chosen range is practised like a short surah: no resume point, whole
  // range visible and scored.
  const trackProgress = isLong && !range;

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

  const goTo = (t: GotoTarget) => {
    const m = surahMeta(t.surah);
    if (!m) return;
    if (t.surah !== surahId) {
      setSurahId(t.surah);
      setSurah(null);
    }
    const clamp = (v: number | undefined) => (v ? Math.max(1, Math.min(m.ayahCount, v)) : undefined);
    const from = clamp(t.from);
    const to = clamp(t.to);
    setRange(from && to && to >= from && m.ayahCount > 10 ? { from, to } : null);
    setStartVerse(clamp(t.verse));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectSurah = (id: number) => {
    if (id === surahId) return;
    goTo({ surah: id });
  };

  // Deep links (?surah=2&verse=255 or &from=1&to=5) and in-app jumps from the
  // progress page's "Practice" buttons.
  useEffect(() => {
    const fromUrl = parseGotoFromUrl();
    if (fromUrl) goTo(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const goSurah = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      if (typeof id === "number") goTo({ surah: id });
    };
    const go = (e: Event) => {
      const t = (e as CustomEvent<GotoTarget>).detail;
      if (t && typeof t.surah === "number") goTo(t);
    };
    window.addEventListener("dugsi:goto-surah", goSurah as EventListener);
    window.addEventListener("dugsi:goto", go as EventListener);
    return () => {
      window.removeEventListener("dugsi:goto-surah", goSurah as EventListener);
      window.removeEventListener("dugsi:goto", go as EventListener);
    };
    // goTo closes over surahId; re-bind when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahId]);

  const startOver = () => {
    if (trackProgress) resetFurthest(userId, surahId);
    setResumeVerse(0);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // The verses to practise: the chosen range, or the whole surah.
  const ayat = useMemo(() => {
    if (!surah) return null;
    if (!range) return surah.ayat;
    return surah.ayat.filter((a) => a.number >= range.from && a.number <= range.to);
  }, [surah, range]);

  return (
    <div className="space-y-6">
      {/* Surah picker (all 114) */}
      <SurahPicker current={surahId} onSelect={selectSurah} />

      {isLong && (
        <VerseRange ayahCount={meta.ayahCount} range={range} onChange={(r) => goTo({ surah: surahId, from: r?.from, to: r?.to })} />
      )}

      <p className="text-center text-sm text-ink/60">
        {range
          ? `Practising verses ${range.from}–${range.to} · only these are scored · tap ▶ to hear a qari.`
          : isLong
            ? "Scroll to read · recite any part (only that part is scored) · tap ▶ to hear a qari."
            : "Recite aloud, or tap ▶ to hear a qari."}{" "}
        <Link href="/listen" className="underline underline-offset-2 hover:text-ink">
          Just listen instead →
        </Link>
      </p>

      {resumeVerse > 1 && !startVerse && (
        <p className="text-center text-xs text-ink/55">
          Continuing from verse {resumeVerse}.{" "}
          <button onClick={startOver} className="underline underline-offset-2 hover:text-ink">
            Start from the beginning
          </button>
        </p>
      )}

      {loading || !surah || !ayat ? (
        <div className="flex justify-center py-10 text-ink/60">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        </div>
      ) : (
        <Reciter ayat={ayat} surahNumber={surahId} trackProgress={trackProgress} startVerse={range ? undefined : startVerse} />
      )}
    </div>
  );
}
