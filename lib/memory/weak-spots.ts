// What the history says about each word a reader has slipped on — not just how
// often, but how (skipped, or said as something else, and what), whether it has
// been put right since, and when it is due to be practised again.
//
// Pure: history rows in, weak spots out, the clock injected. Every number here
// comes from the stored sessions; nothing is estimated.

import type { SessionRow } from "@/lib/history";

/** Days to wait before a word is due again, by how many clean recitations it
 *  has had since its last slip (a Leitner-style ladder). */
export const REVIEW_DAYS = [0, 1, 3, 7, 14];
/** Clean recitations in a row after which a word counts as put right. */
export const FIXED_AFTER = 3;

export interface WeakSpot {
  surah: number;
  /** Word index in the surah (flattened, as stored). */
  i: number;
  verse: number;
  skipped: number;
  wrong: number;
  /** What was heard instead, most frequent first (normalised spelling). */
  heard: { text: string; n: number }[];
  lastSlip: string;
  /** Recitations of this verse since the last slip, without a slip on this word. */
  cleanSince: number;
  state: "slipping" | "improving" | "fixed";
  /** Due for practice now (spaced review). */
  due: boolean;
  /** How the reader tends to get it wrong. */
  pattern: "skips" | "substitutes" | "both";
}

/** Word index → verse number, per surah (from the surah text). */
export type VerseIndex = Map<number, number[]>;

export function weakSpots(rows: SessionRow[], verses: VerseIndex, now: Date): WeakSpot[] {
  const oldestFirst = [...rows].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const spots = new Map<string, WeakSpot & { lastSeen: string }>();

  for (const r of oldestFirst) {
    const verseOf = verses.get(r.surah);
    if (!verseOf) continue;
    const slipped = new Set<number>();
    for (const m of r.mistakes ?? []) {
      if (!m || typeof m.i !== "number") continue;
      const verse = verseOf[m.i];
      if (!verse) continue;
      slipped.add(m.i);
      const key = `${r.surah}:${m.i}`;
      const skippedNow = m.t ? m.t === "s" : m.h === null;
      let s = spots.get(key);
      if (!s) {
        s = { surah: r.surah, i: m.i, verse, skipped: 0, wrong: 0, heard: [], lastSlip: r.created_at, cleanSince: 0, state: "slipping", due: true, pattern: "skips", lastSeen: r.created_at };
        spots.set(key, s);
      }
      if (skippedNow) s.skipped++;
      else {
        s.wrong++;
        if (m.h) {
          const h = s.heard.find((x) => x.text === m.h);
          if (h) h.n++;
          else s.heard.push({ text: m.h, n: 1 });
        }
      }
      s.lastSlip = r.created_at;
      s.lastSeen = r.created_at;
      s.cleanSince = 0;
    }
    // A recitation that heard the verse and got the word right counts as clean.
    // Newer rows list the verses actually heard; older ones only a span.
    const heard = Array.isArray(r.hv) ? new Set(r.hv) : null;
    const from = r.from_verse ?? null;
    const to = r.to_verse ?? null;
    if (!heard && (from === null || to === null)) continue;
    const covers = (v: number) => (heard ? heard.has(v) : v >= from! && v <= to!);
    for (const s of spots.values()) {
      if (s.surah !== r.surah || slipped.has(s.i)) continue;
      if (covers(s.verse) && +new Date(r.created_at) > +new Date(s.lastSlip)) {
        s.cleanSince++;
        s.lastSeen = r.created_at;
      }
    }
  }

  const out: WeakSpot[] = [];
  for (const { lastSeen, ...s } of spots.values()) {
    s.heard.sort((a, b) => b.n - a.n);
    s.pattern = s.skipped && s.wrong ? "both" : s.skipped ? "skips" : "substitutes";
    s.state = s.cleanSince >= FIXED_AFTER ? "fixed" : s.cleanSince > 0 ? "improving" : "slipping";
    const wait = REVIEW_DAYS[Math.min(s.cleanSince, REVIEW_DAYS.length - 1)] * 86_400_000;
    s.due = s.state !== "fixed" && +now - +new Date(lastSeen) >= wait;
    out.push(s);
  }
  // Due and slipping first, then by how often, then most recent.
  const rank = (s: WeakSpot) => (s.state === "fixed" ? 2 : s.due ? 0 : 1);
  return out.sort(
    (a, b) => rank(a) - rank(b) || b.skipped + b.wrong - (a.skipped + a.wrong) || +new Date(b.lastSlip) - +new Date(a.lastSlip),
  );
}

/** One line a person understands: "skipped 3×, said ‘ربنا’ once". */
export function describe(s: WeakSpot): string {
  const parts: string[] = [];
  if (s.skipped) parts.push(`skipped ${s.skipped}×`);
  if (s.wrong) {
    const top = s.heard[0];
    parts.push(top ? `said “${top.text}”${top.n > 1 ? ` ${top.n}×` : ""}${s.wrong > top.n ? ` (${s.wrong}× in all)` : ""}` : `said wrong ${s.wrong}×`);
  }
  return parts.join(" · ");
}
