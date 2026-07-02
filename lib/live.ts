import { similarity } from "@/lib/arabic";
import type { WordStatus } from "@/lib/align";

export interface LiveResult {
  /** refIndex -> status (only positive marks while live: correct / close). */
  statuses: Record<number, WordStatus>;
  /** Index of the next expected word the reciter should say. */
  pointer: number;
}

const MATCH = 0.8; // >= shown green (correct)
const CLOSE = 0.55; // >= shown amber (close) and still advances
const FWD = 6; // how far ahead to look for the next word
const BACK = 6; // how far back — lets the reciter re-read a little
const CONTINUITY = 0.04; // bias toward staying near the current position
const RECOVER_AFTER = 2; // consecutive misses before stepping the pointer forward

/**
 * Real-time recitation tracking. Runs on every interim speech result to light
 * words green/amber as the reciter passes them. It is deliberately *positive*:
 * it never marks words wrong or skipped live (browser recognition is noisy, and
 * a flood of red is discouraging and jumpy) — the detailed red/skipped feedback
 * comes from the full alignment shown when the reciter stops.
 *
 * A continuity bias keeps the cursor near its current position so it doesn't
 * jump to far-away occurrences of common words. `expected` must be normalised;
 * `heard` are normalised spoken tokens.
 */
export function trackLive(expected: string[], heard: string[], startPointer = 0): LiveResult {
  const statuses: Record<number, WordStatus> = {};
  let pointer = Math.max(0, Math.min(expected.length, startPointer));
  let miss = 0;

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
      statuses[bestIndex] = bestSim >= MATCH ? "correct" : "close";
      pointer = bestIndex + 1;
      miss = 0;
    } else {
      // Unrecognised word — don't mark anything (avoid false reds); just nudge
      // the pointer forward after a couple of misses so it can't stall.
      miss++;
      if (miss >= RECOVER_AFTER) {
        pointer = Math.min(expected.length, pointer + 1);
        miss = 0;
      }
    }
  }

  return { statuses, pointer };
}
