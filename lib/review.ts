// Map each recited reference word to the time range in the user's own recording
// where they said it, so a "hear yourself" button can replay just that word.
//
// The full alignment tells us, per reference word, the (normalised) word the
// reciter actually said. Whisper additionally returns word-level timestamps.
// Both sequences run in spoken order, so a forward two-pointer with a small
// look-ahead recovers a good word↔time mapping even when the two tokenisations
// don't line up one-to-one.

import { normalizeWord, similarity } from "@/lib/arabic";
import type { TimedWord } from "@/lib/tajweed/timing";

export interface HeardWord {
  refIndex: number;
  /** Normalised word the reciter said, or null if the word was skipped. */
  heard: string | null;
}

export interface TimeRange {
  start: number;
  end: number;
}

/** refIndex → time range in the recording (only for words actually spoken). */
export function mapRefTimes(words: HeardWord[], timed: TimedWord[]): Record<number, TimeRange> {
  const out: Record<number, TimeRange> = {};
  if (timed.length === 0) return out;

  const normTimed = timed.map((t) => normalizeWord(t.word));
  let ti = 0;
  for (const w of words) {
    if (w.heard == null) continue; // skipped — nothing to play back
    if (ti >= timed.length) break;

    // Find the best-matching timed word within a short look-ahead.
    let bestK = -1;
    let bestSim = 0;
    for (let k = ti; k < Math.min(timed.length, ti + 4); k++) {
      const sim = similarity(normTimed[k], w.heard);
      if (sim > bestSim) {
        bestSim = sim;
        bestK = k;
      }
    }

    const k = bestSim >= 0.5 && bestK >= 0 ? bestK : ti;
    const t = timed[k];
    if (t && Number.isFinite(t.start) && Number.isFinite(t.end) && t.end > t.start) {
      out[w.refIndex] = { start: t.start, end: t.end };
    }
    ti = k + 1;
  }
  return out;
}
