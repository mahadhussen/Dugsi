"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadStats, MEMORISED_THRESHOLD, type Stats, type SurahStat } from "@/lib/supabase/progress";
import { surahMeta } from "@/lib/quran";
import SurahMistakes from "./SurahMistakes";

const GOAL_KEY = "dugsi:dailyGoal";

/** "Your progress" — daily goal, surahs to work on, and memorisation mastery. */
export default function ProgressPanel() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [openSurah, setOpenSurah] = useState<number | null>(null);
  const [goal, setGoal] = useState(1);

  useEffect(() => {
    try {
      const g = Number(localStorage.getItem(GOAL_KEY));
      if (g >= 1) setGoal(g);
    } catch {
      /* ignore */
    }
  }, []);
  const changeGoal = (next: number) => {
    const g = Math.max(1, Math.min(10, next));
    setGoal(g);
    try {
      localStorage.setItem(GOAL_KEY, String(g));
    } catch {
      /* ignore */
    }
  };

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
  const needsWork = stats.bySurah
    .filter((s) => s.bestScore < MEMORISED_THRESHOLD)
    .sort((a, b) => a.bestScore - b.bestScore)
    .slice(0, 3);
  const goalMet = stats.todayCount >= goal;

  return (
    <div className="rounded-2xl border border-gold/25 bg-white/70 p-5 shadow-soft backdrop-blur-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-5 w-1.5 rounded-full bg-gold" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/70">Your progress</h3>
      </div>

      {/* Today — daily goal */}
      <div className="flex items-center gap-4 rounded-xl border border-emerald/15 bg-emerald/5 p-4">
        <GoalRing done={stats.todayCount} goal={goal} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            {goalMet ? "Today's goal reached 🎉" : `Today: ${stats.todayCount} / ${goal}`}
          </p>
          <p className="text-xs text-ink/60">
            {goalMet
              ? `Nice — you're on a ${stats.streak}-day streak.`
              : stats.streak > 0
                ? `Recite to keep your ${stats.streak}-day streak 🔥`
                : "Recite today to start a streak 🔥"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <GoalStep label="−" onClick={() => changeGoal(goal - 1)} disabled={goal <= 1} />
          <GoalStep label="+" onClick={() => changeGoal(goal + 1)} disabled={goal >= 10} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        <Metric value={`${stats.streak}🔥`} label="day streak" />
        <Metric value={String(stats.memorisedCount)} label="memorised" />
        <Metric value={`${stats.averageScore}`} label="avg score" />
      </div>

      {/* Needs work — weakest practised surahs */}
      {needsWork.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/45">Work on next</p>
          <ul className="space-y-2">
            {needsWork.map((s) => (
              <li
                key={s.surah}
                className="flex items-center justify-between rounded-xl border border-ink/10 bg-white px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink/80">
                    {surahMeta(s.surah)?.transliteration ?? `Surah ${s.surah}`}
                  </span>
                  <span className="text-xs text-ink/45">best {s.bestScore} · {s.attempts}×</span>
                </span>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("dugsi:goto-surah", { detail: s.surah }))}
                  className="shrink-0 rounded-lg bg-emerald px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition active:scale-95"
                >
                  Practice
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Memorisation mastery per surah */}
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Memorisation</p>
          <p className="text-xs text-ink/45">{stats.bySurah.length} surahs practised</p>
        </div>
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

function GoalRing({ done, goal }: { done: number; goal: number }) {
  const pct = Math.max(0, Math.min(1, goal ? done / goal : 0));
  const r = 22;
  const c = 2 * Math.PI * r;
  const met = done >= goal;
  const color = met ? "#0f766e" : "#c9a24b";
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#e7e1d3" strokeWidth="5" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold" style={{ color }}>
        {met ? "✓" : done}
      </span>
    </div>
  );
}

function GoalStep({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label === "+" ? "Increase daily goal" : "Decrease daily goal"}
      className="grid h-7 w-7 place-items-center rounded-full border border-ink/15 text-ink/70 transition hover:bg-ink/5 disabled:opacity-30"
    >
      {label}
    </button>
  );
}

function SurahMastery({
  stat,
  open,
  onToggle,
}: {
  stat: SurahStat;
  open: boolean;
  onToggle: () => void;
}) {
  const name = surahMeta(stat.surah)?.transliteration ?? `Surah ${stat.surah}`;
  const memorised = stat.bestScore >= MEMORISED_THRESHOLD;
  const color = barColor(stat.bestScore);
  const reviewable = stat.mistakes.length > 0;
  return (
    <li>
      <button
        onClick={onToggle}
        disabled={!reviewable}
        className="w-full text-left disabled:cursor-default"
        aria-expanded={open}
      >
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-ink/80">
            {memorised && <span title="Memorised">✓</span>}
            {name}
          </span>
          <span className="flex items-center gap-2 text-xs text-ink/45">
            {reviewable && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                {stat.mistakes.length} to review
              </span>
            )}
            <span>{formatWhen(stat.lastPracticed)}</span>
            <span className="font-semibold" style={{ color }}>
              {stat.bestScore}
            </span>
            {reviewable && <span className={`transition ${open ? "rotate-180" : ""}`}>▾</span>}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(4, Math.min(100, stat.bestScore))}%`, backgroundColor: color }}
          />
        </div>
      </button>
      {open && reviewable && <SurahMistakes surahNumber={stat.surah} stored={stat.mistakes} />}
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
