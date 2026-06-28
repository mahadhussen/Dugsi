"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadStats, MEMORISED_THRESHOLD, type Stats, type SurahStat } from "@/lib/supabase/progress";
import { surahMeta } from "@/lib/quran";

/** "Your progress" — streak, memorisation mastery per surah, recent scores. */
export default function ProgressPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(() => {
    if (!user) {
      setStats(null);
      return;
    }
    void loadStats(user.id).then(setStats);
  }, [user]);

  useEffect(() => {
    refresh();
    window.addEventListener("dugsi:session", refresh);
    return () => window.removeEventListener("dugsi:session", refresh);
  }, [refresh]);

  if (!user || !stats || stats.totalSessions === 0) return null;

  const surahs = showAll ? stats.bySurah : stats.bySurah.slice(0, 8);

  return (
    <div className="rounded-2xl border border-gold/25 bg-white/70 p-5 shadow-soft backdrop-blur-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-5 w-1.5 rounded-full bg-gold" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/70">Your progress</h3>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Metric value={`${stats.streak}🔥`} label="day streak" />
        <Metric value={String(stats.memorisedCount)} label="memorised" />
        <Metric value={`${stats.averageScore}`} label="avg score" />
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Memorisation</p>
          <p className="text-xs text-ink/45">{stats.bySurah.length} surahs practised</p>
        </div>
        <ul className="space-y-2.5">
          {surahs.map((s) => (
            <SurahMastery key={s.surah} stat={s} />
          ))}
        </ul>
        {stats.bySurah.length > 8 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 w-full rounded-lg border border-ink/10 py-1.5 text-xs font-medium text-ink/60 transition hover:bg-ink/5"
          >
            {showAll ? "Show less" : `Show all ${stats.bySurah.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

function SurahMastery({ stat }: { stat: SurahStat }) {
  const name = surahMeta(stat.surah)?.transliteration ?? `Surah ${stat.surah}`;
  const memorised = stat.bestScore >= MEMORISED_THRESHOLD;
  const color = barColor(stat.bestScore);
  return (
    <li>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-ink/80">
          {memorised && <span title="Memorised">✓</span>}
          {name}
        </span>
        <span className="flex items-center gap-2 text-xs text-ink/45">
          <span>{formatWhen(stat.lastPracticed)}</span>
          <span className="font-semibold" style={{ color }}>
            {stat.bestScore}
          </span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink/8">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(4, Math.min(100, stat.bestScore))}%`, backgroundColor: color }}
        />
      </div>
    </li>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-3">
      <div className="text-2xl font-bold text-emerald-deep">{value}</div>
      <div className="text-xs text-ink/55">{label}</div>
    </div>
  );
}

function barColor(score: number): string {
  if (score >= MEMORISED_THRESHOLD) return "#0f766e"; // memorised — teal
  if (score >= 70) return "#059669"; // strong — green
  if (score >= 50) return "#d97706"; // learning — amber
  return "#9ca3af"; // new — grey
}

function formatWhen(iso: string): string {
  const then = new Date(iso);
  const diffDays = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}
