"use client";

import { useState } from "react";
import Link from "next/link";
import { MEMORISED_THRESHOLD, type SurahStat } from "@/lib/supabase/progress";
import { surahMeta } from "@/lib/quran";
import SurahMistakes from "./SurahMistakes";

/** Per-surah memorisation mastery: best score bar, verses mastered, and an
 *  expandable review of the words missed in that surah. */
export default function SurahMasteryList({ bySurah, limit = 8 }: { bySurah: SurahStat[]; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const [openSurah, setOpenSurah] = useState<number | null>(null);
  const surahs = showAll ? bySurah : bySurah.slice(0, limit);
  if (bySurah.length === 0) return null;
  return (
    <div>
      <ul className="space-y-2.5">
        {surahs.map((s) => (
          <SurahMastery
            key={s.surah}
            stat={s}
            open={openSurah === s.surah}
            onToggle={() => setOpenSurah((cur) => (cur === s.surah ? null : s.surah))}
          />
        ))}
      </ul>
      {bySurah.length > limit && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full rounded-lg border border-ink/10 py-1.5 text-xs font-medium text-ink/60 transition hover:bg-ink/5"
        >
          {showAll ? "Show less" : `Show all ${bySurah.length}`}
        </button>
      )}
    </div>
  );
}

function SurahMastery({ stat, open, onToggle }: { stat: SurahStat; open: boolean; onToggle: () => void }) {
  const meta = surahMeta(stat.surah);
  const name = meta?.transliteration ?? `Surah ${stat.surah}`;
  const memorised = stat.bestScore >= MEMORISED_THRESHOLD;
  const color = barColor(stat.bestScore);
  const reviewable = stat.mistakes.length > 0;
  return (
    <li>
      <button onClick={onToggle} disabled={!reviewable} className="w-full text-left disabled:cursor-default" aria-expanded={open}>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-ink/80">
            {memorised && <span title="Memorised">✓</span>}
            {name}
            {meta && meta.ayahCount > 10 && stat.memorisedVerses > 0 && (
              <span className="text-xs text-ink/45">
                · {stat.memorisedVerses}/{meta.ayahCount} verses mastered
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 text-xs text-ink/45">
            {reviewable && (
              <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 font-medium text-amber-600">{stat.mistakes.length} to review</span>
            )}
            <span>{formatWhen(stat.lastPracticed)}</span>
            <span className="font-semibold" style={{ color }}>
              {stat.bestScore}
            </span>
            {reviewable && <span className={`transition ${open ? "rotate-180" : ""}`}>▾</span>}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, Math.min(100, stat.bestScore))}%`, backgroundColor: color }} />
        </div>
      </button>
      {open && reviewable && (
        <div>
          <SurahMistakes surahNumber={stat.surah} stored={stat.mistakes} />
          <div className="flex justify-end pt-2">
            <Link href={`/quran?surah=${stat.surah}`} className="rounded-lg bg-emerald px-3 py-1.5 text-xs font-semibold text-white shadow-soft">
              Practise {name}
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

export function barColor(score: number): string {
  if (score >= MEMORISED_THRESHOLD) return "var(--good)"; // memorised — teal
  if (score >= 70) return "#22c55e"; // strong — green
  if (score >= 50) return "var(--warn)"; // learning — amber
  return "var(--muted)"; // new — grey
}

export function formatWhen(iso: string): string {
  const then = new Date(iso);
  const diffDays = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}
