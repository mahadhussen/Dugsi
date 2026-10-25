"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadSurah, flattenAyat, surahMeta } from "@/lib/quran";
import type { WordMistake } from "@/lib/supabase/progress";
import { readHistory } from "@/lib/history";
import { describe, weakSpots, type WeakSpot, type VerseIndex } from "@/lib/memory/weak-spots";
import { playVerseOnce } from "@/lib/verse-player";

interface Resolved extends WeakSpot {
  uthmani: string;
  translit?: string;
}

const STATE_LABEL: Record<WeakSpot["state"], string> = {
  slipping: "Still slipping",
  improving: "Getting better",
  fixed: "Put right",
};

/** Every word this reader has slipped on: how (skipped, or said as what), whether
 *  it has been put right since, and whether it is due for practice — with the
 *  Sheikh reading the verse and a one-tap way to practise exactly there. */
export default function MistakesPanel({ words }: { words: WordMistake[] }) {
  const [resolved, setResolved] = useState<Resolved[] | null>(null);
  const [filter, setFilter] = useState<number | "all">("all");

  useEffect(() => {
    let cancelled = false;
    const rows = readHistory();
    const surahs = Array.from(new Set([...words.map((w) => w.surah), ...rows.filter((r) => r.mistakes?.length).map((r) => r.surah)]));
    void Promise.all(surahs.map((s) => loadSurah(s).then((x) => [s, flattenAyat(x.ayat)] as const))).then((pairs) => {
      if (cancelled) return;
      const verses: VerseIndex = new Map(pairs.map(([s, flat]) => [s, flat.map((f) => f.ayah)]));
      const flat = new Map(pairs);
      const out: Resolved[] = [];
      for (const s of weakSpots(rows, verses, new Date())) {
        const fw = flat.get(s.surah)?.[s.i];
        if (fw) out.push({ ...s, uthmani: fw.word.uthmani, translit: fw.word.translit });
      }
      setResolved(out);
    });
    return () => {
      cancelled = true;
    };
  }, [words]);

  const surahOptions = useMemo(() => Array.from(new Set((resolved ?? []).map((w) => w.surah))).sort((a, b) => a - b), [resolved]);
  const shown = useMemo(() => (resolved ?? []).filter((w) => filter === "all" || w.surah === filter), [resolved, filter]);
  const due = shown.filter((w) => w.due).length;

  if (!resolved) return <p className="text-xs text-ink/40">Loading…</p>;
  if (resolved.length === 0) {
    return <p className="text-sm text-ink/55">No mistakes recorded yet. Recite, and every word you slip on is collected here so you can drill your weak spots.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-ink/50">Surah:</span>
        <FilterChip on={filter === "all"} onClick={() => setFilter("all")} label="All" />
        {surahOptions.map((s) => (
          <FilterChip key={s} on={filter === s} onClick={() => setFilter(s)} label={surahMeta(s)?.transliteration ?? String(s)} />
        ))}
      </div>
      {due > 0 && (
        <p className="mb-2 text-sm font-semibold text-ink/60">
          {due} word{due > 1 ? "s are" : " is"} due for practice today — the ones you slipped on and have not recited cleanly since.
        </p>
      )}
      <ul className="space-y-2">
        {shown.slice(0, 60).map((w) => {
          const meta = surahMeta(w.surah);
          const long = (meta?.ayahCount ?? 0) > 10;
          const href = long ? `/quran?surah=${w.surah}&from=${w.verse}&to=${w.verse}&mode=recite` : `/quran?surah=${w.surah}&verse=${w.verse}&mode=recite`;
          return (
            <li
              key={`${w.surah}:${w.i}`}
              className={`flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-ink/5 ${w.state === "fixed" ? "opacity-60" : ""}`}
            >
              <div className="min-w-0">
                <div className="ayah text-2xl leading-tight text-ink" dir="rtl">
                  {w.uthmani}
                </div>
                <div className="text-xs text-ink/55">
                  <span className={w.state === "fixed" ? "font-semibold text-emerald-bright" : w.skipped + w.wrong >= 3 ? "font-semibold text-red-500" : "font-semibold text-amber-600"}>
                    {describe(w)}
                  </span>
                  {` · ${meta?.transliteration ?? "Surah " + w.surah} ${w.verse}`}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                  <span className="rounded-full bg-ink/5 px-2 py-0.5 text-ink/55">
                    {STATE_LABEL[w.state]}
                    {w.cleanSince > 0 && w.state !== "fixed" ? ` · ${w.cleanSince} clean since` : ""}
                  </span>
                  {w.due && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-700">Due today</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => playVerseOnce(w.surah, w.verse)}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-emerald ring-1 ring-emerald/30 hover:bg-emerald/10"
                  aria-label={`Hear the Sheikh read verse ${w.verse}`}
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
      {shown.length > 60 && <p className="mt-2 text-xs text-ink/45">Showing 60 of {shown.length}.</p>}
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
