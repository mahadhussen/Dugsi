"use client";

import { useSettings, updateSettings } from "@/lib/settings";
import { useAuth } from "@/lib/supabase/AuthProvider";
import type { Stats } from "@/lib/supabase/progress";

interface Goal {
  key: "dailyMinutes" | "dailySessions" | "weeklyVerses" | "monthlyMemorise";
  label: string;
  period: string;
  done: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}

/** Goal progress bars with inline +/- editing. Goals sync with the account. */
export default function GoalsPanel({ stats, editable = true }: { stats: Stats; editable?: boolean }) {
  const settings = useSettings();
  const { user } = useAuth();
  const goals: Goal[] = [
    { key: "dailyMinutes", label: "Minutes recited", period: "today", done: Math.round(stats.todaySeconds / 60), unit: "min", min: 1, max: 240, step: 5 },
    { key: "dailySessions", label: "Recitations", period: "today", done: stats.todayCount, unit: "", min: 1, max: 20, step: 1 },
    { key: "weeklyVerses", label: "Verses recited", period: "this week", done: stats.weekVerses, unit: "", min: 1, max: 2000, step: 5 },
    { key: "monthlyMemorise", label: "Verses memorised", period: "last 30 days", done: stats.monthMemorised, unit: "", min: 1, max: 1000, step: 5 },
  ];
  const set = (g: Goal, v: number) => updateSettings({ [g.key]: Math.max(g.min, Math.min(g.max, v)) }, user?.id ?? null);

  return (
    <ul className="space-y-3">
      {goals.map((g) => {
        const target = settings[g.key];
        const pct = Math.min(100, (g.done / target) * 100);
        const met = g.done >= target;
        return (
          <li key={g.key} className="rounded-xl border border-ink/10 bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink/80">
                {g.label} <span className="text-xs text-ink/45">· {g.period}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={`font-semibold ${met ? "text-emerald-bright" : "text-ink"}`}>
                  {g.done}
                  <span className="font-normal text-ink/45"> / {target}{g.unit ? ` ${g.unit}` : ""}</span>
                </span>
                {editable && (
                  <span className="flex items-center gap-1">
                    <Step label="−" onClick={() => set(g, target - g.step)} disabled={target <= g.min} />
                    <Step label="+" onClick={() => set(g, target + g.step)} disabled={target >= g.max} />
                  </span>
                )}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: met ? "var(--good)" : "#cfae5e" }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Step({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label === "+" ? "Increase goal" : "Decrease goal"}
      className="grid h-6 w-6 place-items-center rounded-full border border-ink/15 text-xs text-ink/70 transition hover:bg-ink/5 disabled:opacity-30"
    >
      {label}
    </button>
  );
}
