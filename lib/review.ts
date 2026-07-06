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

// Recognition reports a word a moment after it was spoken, so a clip leans a
// little behind its stamp. The window must stay SHORT and must not overlap the
// neighbouring words' windows — otherwise two mistakes close together in the
// recitation replay almost the same audio, and every "You" sounds identical.
const CLIP_LAG = 1.0; // a word is reported ~this long after it is spoken
const CLIP_TAIL = 0.25; // reach a little past the stamp to catch the word's end
const CLIP_MAX = 2.0; // never let one word's clip run longer than this

/** Turn "the live tracker matched word i at t seconds" into playable windows,
 *  one per word. Windows are bounded by their neighbours so each mistake plays a
 *  distinct slice of the recording rather than a wide, overlapping blur. */
export function liveClipTimes(passedAt: Record<number, number>): Record<number, TimeRange> {
  const entries = Object.keys(passedAt)
    .map((k) => ({ i: Number(k), t: passedAt[Number(k)] }))
    .filter((e) => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t);

  const out: Record<number, TimeRange> = {};
  let prevEnd = 0;
  for (const { i, t } of entries) {
    let start = Math.max(0, t - CLIP_LAG);
    // Never start before the previous word's clip ended — keeps clips distinct.
    if (start < prevEnd) start = prevEnd;
    let end = t + CLIP_TAIL;
    // Cap the length so a long pause before a word doesn't make a huge window.
    if (end - start > CLIP_MAX) start = end - CLIP_MAX;
    if (end <= start) end = start + 0.3;
    out[i] = { start, end };
    prevEnd = end;
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
 * Whisper word timestamps can come back broken (chunked long-form decoding is
 * known to misplace them). A clip pointing outside the actual recording plays
 * a completely wrong passage — worse than none. Keep only times that fit
 * inside the recording; if most don't, distrust the lot.
 */
export function sanePreciseTimes(
  precise: Record<number, TimeRange>,
  durationSec: number,
): Record<number, TimeRange> {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return precise;
  const keys = Object.keys(precise);
  if (keys.length === 0) return precise;
  const out: Record<number, TimeRange> = {};
  let kept = 0;
  for (const k of keys) {
    const t = precise[k as unknown as number];
    if (t.start >= 0 && t.end > t.start && t.end <= durationSec + 2) {
      out[k as unknown as number] = t;
      kept++;
    }
  }
  // If most timestamps don't even fit in the recording, none can be trusted.
  return kept >= keys.length / 2 ? out : {};
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
