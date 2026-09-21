"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SurahPicker from "./SurahPicker";
import ReciterPicker from "./ReciterPicker";
import ListenPlayer from "./ListenPlayer";
import SurahView from "./SurahView";
import { loadSurah, surahMeta, type Surah } from "@/lib/quran";
import { useSettings } from "@/lib/settings";

/** The "just listen" experience: pick a surah and a Sheikh, then play through
 *  the whole Quran verse by verse while reading along. No microphone. */
export default function ListenView() {
  const [surahId, setSurahId] = useState(1);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState<{ verse: number; word: number } | null>(null);
  const settings = useSettings();

  // Top bar prev/next and deep links from the progress page.
  useEffect(() => {
    const go = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      if (typeof id === "number" && id >= 1 && id <= 114) selectSurah(id);
    };
    window.addEventListener("dugsi:goto-surah", go as EventListener);
    return () => window.removeEventListener("dugsi:goto-surah", go as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahId]);

  const meta = surahMeta(surahId)!;

  // Global word index of the word being recited (SurahView highlights + follows it).
  const offsets = useMemo(() => {
    const o = new Map<number, number>();
    let acc = 0;
    for (const a of surah?.ayat ?? []) {
      o.set(a.number, acc);
      acc += a.words.length;
    }
    return o;
  }, [surah]);
  const activeIndex = pos && offsets.has(pos.verse) ? offsets.get(pos.verse)! + pos.word : undefined;
  const onWordChange = useCallback((p: { verse: number; word: number } | null) => setPos(p), []);

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
      <SurahPicker current={surahId} onSelect={selectSurah} hideTrigger />
      <ReciterPicker />

      {/* Hands-free player: plays the whole surah, then flows into the next. */}
      <ListenPlayer surahId={surahId} onSurahChange={selectSurah} onWordChange={onWordChange} />

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
        <SurahView
          ayat={surah.ayat}
          surahNumber={surahId}
          showTajweed={settings.showTajweed}
          activeIndex={activeIndex}
          showTranslation={settings.showTranslation}
          showTranslit={settings.showTranslit}
        />
      )}
    </div>
  );
}
