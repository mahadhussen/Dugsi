"use client";

import { useEffect, useState } from "react";

export interface Range {
  from: number;
  to: number;
}

/** Pick a verse range to practise (memorising a long surah a few verses at a
 *  time). Whole-surah is the default; the range is applied explicitly so typing
 *  a number doesn't reload the reader mid-keystroke. */
export default function VerseRange({
  ayahCount,
  range,
  onChange,
}: {
  ayahCount: number;
  range: Range | null;
  onChange: (r: Range | null) => void;
}) {
  const [from, setFrom] = useState(String(range?.from ?? 1));
  const [to, setTo] = useState(String(range?.to ?? Math.min(ayahCount, 5)));
  useEffect(() => {
    if (range) {
      setFrom(String(range.from));
      setTo(String(range.to));
    }
  }, [range]);

  const apply = () => {
    const f = Math.max(1, Math.min(ayahCount, Number(from) || 1));
    const t = Math.max(f, Math.min(ayahCount, Number(to) || f));
    onChange({ from: f, to: t });
  };

  const step = (dir: 1 | -1) => {
    if (!range) return;
    const len = range.to - range.from + 1;
    let f = range.from + dir * len;
    let t = range.to + dir * len;
    if (f < 1) {
      f = 1;
      t = Math.min(ayahCount, len);
    }
    if (t > ayahCount) {
      t = ayahCount;
      f = Math.max(1, ayahCount - len + 1);
    }
    onChange({ from: f, to: t });
  };

  const input = "w-16 rounded-lg border border-ink/15 bg-surface-2 px-2 py-1 text-center text-sm outline-none focus:border-emerald";

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-ink/10 bg-surface px-3 py-2 text-sm shadow-soft">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">Practise verses</span>
      <input
        type="number"
        min={1}
        max={ayahCount}
        inputMode="numeric"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        aria-label="From verse"
        className={input}
      />
      <span className="text-ink/40">to</span>
      <input
        type="number"
        min={1}
        max={ayahCount}
        inputMode="numeric"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        aria-label="To verse"
        className={input}
      />
      <button
        onClick={apply}
        className="rounded-lg bg-emerald px-3 py-1 text-xs font-semibold text-white shadow-soft transition active:scale-95"
      >
        Apply
      </button>
      {range && (
        <>
          <button onClick={() => step(-1)} aria-label="Previous range" className="rounded-lg border border-ink/10 px-2 py-1 text-xs text-ink/70 hover:bg-ink/5">
            ◀
          </button>
          <button onClick={() => step(1)} aria-label="Next range" className="rounded-lg border border-ink/10 px-2 py-1 text-xs text-ink/70 hover:bg-ink/5">
            ▶
          </button>
          <button onClick={() => onChange(null)} className="text-xs text-ink/60 underline underline-offset-2 hover:text-ink">
            Whole surah
          </button>
        </>
      )}
    </div>
  );
}
