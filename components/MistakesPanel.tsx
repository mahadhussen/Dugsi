"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadSurah, flattenAyat, surahMeta } from "@/lib/quran";
import type { WordMistake } from "@/lib/supabase/progress";
import { ayahAudioUrl } from "@/lib/audio-quran";
import { useReciter } from "@/lib/reciter-store";

interface Resolved extends WordMistake {
  uthmani: string;
  translit?: string;
  verse: number;
}

/** Every word this reader has ever stumbled on, most frequent first, with a
 *  one-tap way to hear the verse and to practise exactly that verse. */
export default function MistakesPanel({ words }: { words: WordMistake[] }) {
  const [resolved, setResolved] = useState<Resolved[] | null>(null);
  const [filter, setFilter] = useState<number | "all">("all");
  const { reciterId } = useReciter();

  useEffect(() => {
    let cancelled = false;
    const surahs = Array.from(new Set(words.map((w) => w.surah)));
    void Promise.all(surahs.map((s) => loadSurah(s).then((x) => [s, flattenAyat(x.ayat)] as const))).then((pairs) => {
      if (cancelled) return;
      const flat = new Map(pairs);
      const out: Resolved[] = [];
      for (const w of words) {
        const fw = flat.get(w.surah)?.[w.i];
        if (fw) out.push({ ...w, uthmani: fw.word.uthmani, translit: fw.word.translit, verse: fw.ayah });
      }
      setResolved(out);
    });
    return () => {
      cancelled = true;
    };
  }, [words]);

  const surahOptions = useMemo(() => Array.from(new Set(words.map((w) => w.surah))).sort((a, b) => a - b), [words]);
  const shown = useMemo(() => (resolved ?? []).filter((w) => filter === "all" || w.surah === filter), [resolved, filter]);

  if (words.length === 0) {
    return <p className="text-sm text-ink/55">No mistakes recorded yet. Recite, and every word you slip on is collected here so you can drill your weak spots.</p>;
  }
  if (!resolved) return <p className="text-xs text-ink/40">Loading…</p>;

  const playVerse = (surah: number, verse: number) => {
    const a = new Audio(ayahAudioUrl(surah, verse, reciterId));
    void a.play().catch(() => {});
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink/50">Surah:</span>
        <FilterChip on={filter === "all"} onClick={() => setFilter("all")} label="All" />
        {surahOptions.map((s) => (
          <FilterChip key={s} on={filter === s} onClick={() => setFilter(s)} label={surahMeta(s)?.transliteration ?? String(s)} />
        ))}
      </div>
      <ul className="space-y-2">
        {shown.slice(0, 60).map((w) => {
          const meta = surahMeta(w.surah);
          const long = (meta?.ayahCount ?? 0) > 10;
          const href = long ? `/quran?surah=${w.surah}&from=${w.verse}&to=${w.verse}` : `/quran?surah=${w.surah}`;
          return (
            <li key={`${w.surah}:${w.i}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-ink/5">
              <div className="min-w-0">
                <div className="ayah text-2xl leading-tight text-ink" dir="rtl">
                  {w.uthmani}
                </div>
                <div className="truncate text-xs text-ink/50">
                  <span className={w.count >= 3 ? "font-semibold text-red-500" : "font-semibold text-amber-600"}>
                    {w.count}×
                  </span>
                  {" · "}
                  {w.lastHeard === null ? "skipped" : <>said <span className="font-arabic text-ink/70" dir="rtl">{w.lastHeard}</span></>}
                  {w.translit ? ` · ${w.translit}` : ""}
                  {` · ${meta?.transliteration ?? "Surah " + w.surah} ${w.verse}`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => playVerse(w.surah, w.verse)}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-emerald ring-1 ring-emerald/30 hover:bg-emerald/10"
                >
                  ▶ Hear
                </button>
                <Link href={href} className="rounded-full bg-emerald px-2.5 py-1 text-xs font-semibold text-white shadow-soft">
                  Practise
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {shown.length > 60 && <p className="mt-2 text-xs text-ink/45">Showing the 60 most frequent of {shown.length}.</p>}
    </div>
  );
}

function FilterChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 font-medium ring-1 transition ${on ? "bg-emerald text-white ring-emerald" : "bg-surface-2 text-ink/70 ring-ink/15 hover:bg-ink/5"}`}
    >
      {label}
    </button>
  );
}
