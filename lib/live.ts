import { similarity } from "@/lib/arabic";
import type { WordStatus } from "@/lib/align";

export interface LiveResult {
  /** refIndex -> status, for the words covered so far. */
  statuses: Record<number, WordStatus>;
  /** Index of the next expected word the reciter should say. */
  pointer: number;
}

const MATCH = 0.8; // >= counts as a correct word
const CLOSE = 0.55; // >= still advances (a near miss), shown amber
const FWD = 6; // how far ahead to look for the next word
const BACK = 12; // how far back to look — lets the reciter re-read a verse
const RECOVER_AFTER = 2; // consecutive misses before we step the pointer forward

/**
 * Real-time recitation tracking. Runs on every interim speech result to light
 * each word green/red as the reciter passes it. Cost is O(heard · window),
 * independent of surah length.
 *
 * Robustness: it advances on near matches (not just exact), and if the
 * recogniser drops words and the reciter gets ahead, a miss streak steps the
 * pointer forward so it catches up instead of getting stuck. `expected` must be
 * normalised; `heard` are normalised spoken tokens.
 */
export function trackLive(expected: string[], heard: string[]): LiveResult {
  const statuses: Record<number, WordStatus> = {};
  let pointer = 0;
  let miss = 0;

  for (const h of heard) {
    if (!h) continue;

    let bestIndex = -1;
    let bestSim = 0;
    // Look both a little behind (re-reading a verse) and ahead (next words).
    const start = Math.max(0, pointer - BACK);
    const end = Math.min(expected.length, pointer + FWD + 1);
    for (let i = start; i < end; i++) {
      const sim = similarity(h, expected[i]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestSim >= CLOSE) {
      // Words jumped over (moving forward) were not heard — mark them skipped.
      for (let k = pointer; k < bestIndex; k++) {
        if (statuses[k] === undefined) statuses[k] = "missing";
      }
      statuses[bestIndex] = bestSim >= MATCH ? "correct" : "close";
      pointer = bestIndex + 1; // may move back if the reciter re-read earlier
      miss = 0;
    } else {
      // Heard something that doesn't fit here — flag the current word, and after
      // a couple of misses step forward so a dropped word can't stall tracking.
      if (pointer < expected.length && statuses[pointer] === undefined) {
        statuses[pointer] = "wrong";
      }
      miss++;
      if (miss >= RECOVER_AFTER) {
        pointer = Math.min(expected.length, pointer + 1);
        miss = 0;
      }
    }
  }

  return { statuses, pointer };
}
