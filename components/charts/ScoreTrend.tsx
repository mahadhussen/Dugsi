"use client";

import { surahMeta } from "@/lib/quran";

/** Score of the last recitations, as a thin line with hoverable points. */
export default function ScoreTrend({ points }: { points: { score: number; created_at: string; surah: number }[] }) {
  const w = 320;
  const h = 96;
  const padX = 8;
  const padY = 10;
  if (points.length < 2) {
    return <p className="text-xs text-ink/45">Recite a couple more times and your score trend will appear here.</p>;
  }
  const n = points.length;
  const x = (i: number) => padX + (i / (n - 1)) * (w - padX * 2);
  const y = (s: number) => padY + (1 - Math.max(0, Math.min(100, s)) / 100) * (h - padY * 2);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const first = points[0].score;
  const last = points[n - 1].score;
  const delta = last - first;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-24 w-full" role="img" aria-label="Score trend">
        {[90, 60].map((g) => (
          <line key={g} x1={padX} x2={w - padX} y1={y(g)} y2={y(g)} stroke="#e9efec" strokeOpacity="0.08" strokeDasharray="2 3" />
        ))}
        <path d={path} fill="none" stroke="#4fd8a8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.score)} r={i === n - 1 ? 4 : 3} fill={i === n - 1 ? "#4fd8a8" : "#131a17"} stroke="#4fd8a8" strokeWidth="1.5">
            <title>
              {`${surahMeta(p.surah)?.transliteration ?? "Surah " + p.surah} · ${p.score} · ${new Date(p.created_at).toLocaleDateString()}`}
            </title>
          </circle>
        ))}
      </svg>
      <p className="mt-1 text-xs text-ink/55">
        Last {n} recitations · latest <strong className="text-ink">{last}</strong>
        {delta !== 0 && (
          <span className={delta > 0 ? "text-emerald-bright" : "text-amber-300"}>
            {" "}
            ({delta > 0 ? "+" : ""}
            {delta} since the first shown)
          </span>
        )}
      </p>
    </div>
  );
}
