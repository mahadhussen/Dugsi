"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadStats, type Stats } from "@/lib/supabase/progress";
import { surahMeta } from "@/lib/quran";

/** "Your progress" — streak, sessions and recent scores. Signed-in only. */
export default function ProgressPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

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

  return (
    <div className="rounded-2xl border border-gold/25 bg-white/70 p-5 shadow-soft backdrop-blur-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-5 w-1.5 rounded-full bg-gold" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/70">Your progress</h3>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <Metric value={`${stats.streak}🔥`} label={stats.streak === 1 ? "day streak" : "day streak"} />
        <Metric value={String(stats.totalSessions)} label="recitations" />
        <Metric value={`${stats.averageScore}`} label="avg score" />
      </div>

      {stats.recent.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/45">Recent</p>
          <ul className="divide-y divide-gold/10">
            {stats.recent.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink/80">
                  {surahMeta(r.surah)?.transliteration ?? `Surah ${r.surah}`}
                </span>
                <span className="flex items-center gap-3 text-ink/55">
                  <span className="text-xs">{formatWhen(r.created_at)}</span>
                  <ScorePill score={r.score} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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

function ScorePill({ score }: { score: number }) {
  const color = score >= 85 ? "#0f766e" : score >= 60 ? "#d97706" : "#dc2626";
  return (
    <span
      className="inline-grid h-7 w-9 place-items-center rounded-md text-xs font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {score}
    </span>
  );
}

function formatWhen(iso: string): string {
  const then = new Date(iso);
  const diffDays = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}
