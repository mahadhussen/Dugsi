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

// ── Live-derived clips ───────────────────────────────────────────────────────
// Whisper timestamps can't be guaranteed (device limits, network, long audio).
// The live recogniser, however, always knows roughly WHEN the reciter passed
// each word — so we derive per-word clip windows from that. They're coarse
// (recognition reports a word a moment after it was said), so the windows are
// wide: you hear the word in its passage. Precise Whisper times override them.

/** Turn "the live tracker matched word i at t seconds" into playable windows.
 *  Recognition reports a word shortly AFTER it was said, so the window leans
 *  backwards from the stamp. */
export function liveClipTimes(passedAt: Record<number, number>): Record<number, TimeRange> {
  const out: Record<number, TimeRange> = {};
  for (const key in passedAt) {
    const t = passedAt[key];
    if (!Number.isFinite(t)) continue;
    out[key as unknown as number] = { start: Math.max(0, t - 4), end: t + 0.8 };
  }
  return out;
}

/** Precise (Whisper) windows win; live approximations fill every gap. */
export function mergeClipTimes(
  precise: Record<number, TimeRange>,
  approx: Record<number, TimeRange>,
): Record<number, TimeRange> {
  return { ...approx, ...precise };
}

/**
 * The clip to play for a mistake. A mis-said word only plays its OWN clip —
 * playing a neighbour would be the wrong audio, worse than an honest "no
 * clip". A skipped word was never said at all, so the passage around it
 * (nearest timed neighbour, close by) is the honest thing to replay.
 */
export function clipForMistake(
  times: Record<number, TimeRange>,
  refIndex: number,
  skipped: boolean,
  maxDistance = 4,
): TimeRange | undefined {
  if (times[refIndex]) return times[refIndex];
  if (!skipped) return undefined;
  for (let d = 1; d <= maxDistance; d++) {
    const before = times[refIndex - d];
    if (before) return before;
    const after = times[refIndex + d];
    if (after) return after;
  }
  return undefined;
}
