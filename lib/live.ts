import { similarity } from "@/lib/arabic";
import type { WordStatus } from "@/lib/align";

export interface LiveResult {
  /** refIndex -> status. Positive marks (correct / close) always; with mistake
   *  detection on, also "missing" (skipped) and "wrong" (substituted). */
  statuses: Record<number, WordStatus>;
  /** Index of the next expected word the reciter should say. */
  pointer: number;
  /** Heard words that belong nowhere in the text (added words). */
  extras: number;
}

export interface LiveOptions {
  /** Mark skipped and substituted words as you go (Tarteel-style live mistake
   *  detection). Off = the original positive-only marking. */
  mistakes?: boolean;
}

const MATCH = 0.8; // >= shown green (correct)
const CLOSE = 0.55; // >= shown amber (close) and still advances
const FWD = 6; // how far ahead to look for the next word
const BACK = 6; // how far back — lets the reciter re-read a little
const CONTINUITY = 0.04; // bias toward staying near the current position
const RECOVER_AFTER = 2; // consecutive misses before stepping the pointer forward

/**
 * Real-time recitation tracking. Runs on every interim speech result to light
 * words green/amber as the reciter passes them.
 *
 * By default it is deliberately *positive*: it never marks words wrong or
 * skipped live (browser recognition is noisy, and a flood of red is
 * discouraging and jumpy) — the detailed red/skipped feedback comes from the
 * full alignment shown when the reciter stops.
 *
 * With `mistakes: true` it additionally flags, conservatively:
 *   - **skipped** words: expected words the reciter jumped over to reach a later
 *     word that clearly matched (never words the cursor merely nudged past);
 *   - **substituted** words: an unrecognised word said in the slot of an
 *     expected word, right before the recitation picked up again;
 *   - **added** words: unrecognised words said where the text has no gap
 *     (counted, never painted on the text).
 * A word marked live is always re-examined by the full alignment at the end,
 * and a word re-read correctly turns green again.
 *
 * A continuity bias keeps the cursor near its current position so it doesn't
 * jump to far-away occurrences of common words. `expected` must be normalised;
 * `heard` are normalised spoken tokens.
 */
export function trackLive(
  expected: string[],
  heard: string[],
  startPointer = 0,
  opts: LiveOptions = {},
): LiveResult {
  const detect = !!opts.mistakes;
  const statuses: Record<number, WordStatus> = {};
  let pointer = Math.max(0, Math.min(expected.length, startPointer));
  let miss = 0; // consecutive unmatched tokens (for the stall guard)
  let pending = 0; // unmatched tokens since the last match (candidates for substitution)
  let extras = 0;

  for (const h of heard) {
    if (!h) continue;

    let bestIndex = -1;
    let bestScore = -Infinity;
    let bestSim = 0;
    const start = Math.max(0, pointer - BACK);
    const end = Math.min(expected.length, pointer + FWD + 1);
    for (let i = start; i < end; i++) {
      const sim = similarity(h, expected[i]);
      if (sim < CLOSE) continue;
      const score = sim - CONTINUITY * Math.abs(i - pointer);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
        bestSim = sim;
      }
    }

    if (bestIndex >= 0) {
      if (detect) {
        if (bestIndex > pointer) {
          // Jumped ahead: the words in between were said wrong (one per
          // unmatched token we heard) or not said at all.
          const gap = bestIndex - pointer;
          const subs = Math.min(pending, gap);
          for (let i = pointer; i < bestIndex; i++) {
            if (!statuses[i]) statuses[i] = i - pointer < subs ? "wrong" : "missing";
          }
          extras += pending - subs;
        } else if (bestIndex === pointer) {
          // Picked up exactly where expected: anything unmatched before it was
          // an added word (or noise) — count it, never paint it.
          extras += pending;
        }
        // bestIndex < pointer: a re-read — nothing in between to judge.
      }
      statuses[bestIndex] = bestSim >= MATCH ? "correct" : "close";
      pointer = bestIndex + 1;
      miss = 0;
      pending = 0;
    } else {
      // Unrecognised word — don't mark anything on its own (avoid false reds);
      // nudge the pointer forward after a couple of misses so it can't stall.
      miss++;
      pending++;
      if (miss >= RECOVER_AFTER) {
        if (detect && pointer < expected.length && !statuses[pointer]) {
          // Two unrecognised words in a row at this slot: the reciter said
          // something else here.
          statuses[pointer] = "wrong";
          pending = Math.max(0, pending - 1);
        }
        pointer = Math.min(expected.length, pointer + 1);
        miss = 0;
      }
    }
  }

  return { statuses, pointer, extras };
}

/**
 * Merge a tick's statuses into the sticky live picture. Green never fades, a
 * re-read word recovers from red, and red never overwrites green:
 *   correct > close > wrong / missing > nothing.
 * Returns the same object when nothing changed (cheap for React state).
 */
export function mergeLiveStatuses(
  prev: Record<number, WordStatus>,
  next: Record<number, WordStatus>,
): Record<number, WordStatus> {
  let out = prev;
  for (const key in next) {
    const idx = Number(key);
    const cur = prev[idx];
    const nxt = next[idx];
    if (cur === nxt) continue;
    if (cur === undefined || rank(nxt) > rank(cur)) {
      if (out === prev) out = { ...prev };
      out[idx] = nxt;
    }
  }
  return out;
}

function rank(s: WordStatus): number {
  return s === "correct" ? 3 : s === "close" ? 2 : 1;
}
