"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadStats, MEMORISED_THRESHOLD, type Stats } from "@/lib/supabase/progress";
import { useSettings } from "@/lib/settings";
import { surahMeta } from "@/lib/quran";

/** Compact "today" card on the home page: daily goals, streak, what to work on
 *  next — and a link to the full progress page. Works signed out too. */
export default function ProgressPanel() {
  const { user } = useAuth();
  const settings = useSettings();
  const [stats, setStats] = useState<Stats | null>(null);

  const refresh = useCallback(() => {
    void loadStats(user?.id ?? null).then(setStats);
  }, [user]);

  useEffect(() => {
    refresh();
    window.addEventListener("dugsi:session", refresh);
    return () => window.removeEventListener("dugsi:session", refresh);
  }, [refresh]);

  if (!stats || stats.totalSessions === 0) return null;

  const minutes = Math.round(stats.todaySeconds / 60);
  const goalMinutesMet = minutes >= settings.dailyMinutes;
  const goalSessionsMet = stats.todayCount >= settings.dailySessions;
  const goalMet = goalMinutesMet && goalSessionsMet;
  const needsWork = stats.bySurah
    .filter((s) => s.bestScore < MEMORISED_THRESHOLD)
    .sort((a, b) => a.bestScore - b.bestScore)
    .slice(0, 3);

  return (
    <div className="rounded-2xl border border-gold/25 bg-surface/90 p-5 shadow-soft backdrop-blur-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-5 w-1.5 rounded-full bg-gold" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/70">Today</h3>
        </div>
        <Link href="/progress" className="text-xs font-semibold text-emerald-bright underline underline-offset-2">
          Full progress →
        </Link>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-emerald/15 bg-emerald/10 p-4">
        <GoalRing pct={Math.min(1, (minutes / settings.dailyMinutes + stats.todayCount / settings.dailySessions) / 2)} met={goalMet} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {goalMet ? "Today's goal reached 🎉" : `${minutes} / ${settings.dailyMinutes} min · ${stats.todayCount} / ${settings.dailySessions} recitations`}
          </p>
          <p className="text-xs text-ink/60">
            {goalMet
              ? `Nice — you're on a ${stats.streak}-day streak.`
              : stats.streak > 0
                ? `Recite to keep your ${stats.streak}-day streak 🔥`
                : "Recite today to start a streak 🔥"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Metric value={`${stats.streak}🔥`} label="day streak" />
        <Metric value={String(stats.memorisedCount)} label="memorised" />
        <Metric value={`${stats.weekVerses}`} label="verses this week" />
      </div>

      {needsWork.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/45">Work on next</p>
          <ul className="space-y-2">
            {needsWork.map((s) => (
              <li key={s.surah} className="flex items-center justify-between rounded-xl border border-white/10 bg-surface-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink/80">{surahMeta(s.surah)?.transliteration ?? `Surah ${s.surah}`}</span>
                  <span className="text-xs text-ink/45">
                    best {s.bestScore} · {s.attempts}× · {s.mistakes.length} words to review
                  </span>
                </span>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("dugsi:goto-surah", { detail: s.surah }))}
                  className="shrink-0 rounded-lg bg-emerald px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition active:scale-95"
                >
                  Practise
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GoalRing({ pct, met }: { pct: number; met: boolean }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const color = met ? "#4fd8a8" : "#cfae5e";
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#2a3530" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, pct)))} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold" style={{ color }}>
        {met ? "✓" : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-2 p-3">
      <div className="text-2xl font-bold text-emerald-bright">{value}</div>
      <div className="text-xs text-ink/55">{label}</div>
    </div>
  );
}
