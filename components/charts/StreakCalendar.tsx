"use client";

import type { DayStat } from "@/lib/supabase/progress";
import { dayKey } from "@/lib/uid";

const WEEKS = 16;
// One hue, light → dark (sequential): minutes recited that day.
const STEPS = ["#1f2a26", "#175a48", "#178a68", "#1bb388", "#4fd8a8"];

function level(seconds: number, sessions: number): number {
  if (sessions === 0) return 0;
  const min = seconds / 60;
  if (min < 3) return 1;
  if (min < 10) return 2;
  if (min < 20) return 3;
  return 4;
}

/** GitHub-style activity calendar for the last 16 weeks. */
export default function StreakCalendar({ days, now = new Date() }: { days: Record<string, DayStat>; now?: Date }) {
  // Grid columns are weeks (oldest → newest), rows Monday → Sunday.
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const endDow = (end.getDay() + 6) % 7; // Monday = 0
  const start = new Date(end);
  start.setDate(end.getDate() - endDow - (WEEKS - 1) * 7);

  const cells: { key: string; col: number; row: number; stat?: DayStat; future: boolean }[] = [];
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const col = Math.floor(i / 7);
    const row = i % 7;
    const key = dayKey(d);
    if (row === 0 && d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth();
      monthLabels.push({ col, label: d.toLocaleDateString(undefined, { month: "short" }) });
    }
    cells.push({ key, col, row, stat: days[key], future: d.getTime() > end.getTime() });
  }

  const size = 12;
  const gap = 3;
  const w = WEEKS * (size + gap);
  const h = 7 * (size + gap) + 14;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="block" role="img" aria-label="Recitation activity, last 16 weeks">
        {monthLabels.map((m) => (
          <text key={m.col + m.label} x={m.col * (size + gap)} y={10} fontSize="9" fill="#e9efec" opacity="0.55">
            {m.label}
          </text>
        ))}
        {cells.map((c) => {
          const lv = c.stat ? level(c.stat.seconds, c.stat.sessions) : 0;
          const label = c.stat
            ? `${c.key}: ${c.stat.sessions} recitation${c.stat.sessions > 1 ? "s" : ""}, ${Math.round(c.stat.seconds / 60)} min, ${c.stat.verses} verses, best ${c.stat.bestScore}`
            : `${c.key}: no recitation`;
          return (
            <rect
              key={c.key}
              x={c.col * (size + gap)}
              y={14 + c.row * (size + gap)}
              width={size}
              height={size}
              rx={3}
              fill={c.future ? "transparent" : STEPS[lv]}
            >
              <title>{label}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-ink/45">
        less
        {STEPS.map((c) => (
          <span key={c} className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c }} />
        ))}
        more
      </div>
    </div>
  );
}
