"use client";

import type { DayStat } from "@/lib/supabase/progress";
import { dayKey } from "@/lib/uid";

/** Minutes recited per day over the last 7 days, against the daily goal. */
export default function WeekBars({ days, goalMinutes, now = new Date() }: { days: Record<string, DayStat>; goalMinutes: number; now?: Date }) {
  const items: { label: string; minutes: number; today: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const st = days[dayKey(d)];
    items.push({
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      minutes: st ? st.seconds / 60 : 0,
      today: i === 0,
    });
  }
  const max = Math.max(goalMinutes, ...items.map((x) => x.minutes), 1);
  const w = 320;
  const h = 96;
  const bw = 28;
  const gapX = (w - 7 * bw) / 8;
  const base = h - 16;
  const scale = (m: number) => (m / max) * (base - 8);
  const goalY = base - scale(goalMinutes);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block h-24 w-full" role="img" aria-label="Minutes recited per day, last 7 days">
      <line x1={0} x2={w} y1={goalY} y2={goalY} stroke="#cfae5e" strokeWidth="1" strokeDasharray="3 3">
        <title>{`Daily goal: ${goalMinutes} min`}</title>
      </line>
      {items.map((it, i) => {
        const x = gapX + i * (bw + gapX);
        const hgt = Math.max(it.minutes > 0 ? 3 : 0, scale(it.minutes));
        return (
          <g key={i}>
            <rect x={x} y={base - hgt} width={bw} height={hgt} rx={3} fill={it.minutes >= goalMinutes ? "#4fd8a8" : "#178a68"}>
              <title>{`${it.label}: ${it.minutes.toFixed(1)} min`}</title>
            </rect>
            <text x={x + bw / 2} y={h - 3} fontSize="9" textAnchor="middle" fill="#e9efec" opacity={it.today ? 0.9 : 0.5} fontWeight={it.today ? 700 : 400}>
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
