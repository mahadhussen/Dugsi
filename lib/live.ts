import { similarity } from "@/lib/arabic";
import type { WordStatus } from "@/lib/align";

export interface LiveResult {
  /** refIndex -> status, for the words covered so far. */
  statuses: Record<number, WordStatus>;
  /** Index of the next expected word the reciter should say. */
  pointer: number;
}

/**
 * Real-time recitation tracking. Unlike the full alignment (used for the final
 * score), this is a cheap forward-scanning matcher meant to run on every interim
 * speech result: it keeps a pointer into the expected words and lights each word
 * green/red as the reciter passes it. Cost is O(heard · window), independent of
 * surah length, so it stays smooth even on Al-Baqarah.
 *
 * `expected` must already be normalised; `heard` are normalised spoken tokens.
 */
export function trackLive(expected: string[], heard: string[], window = 5): LiveResult {
  const statuses: Record<number, WordStatus> = {};
  let pointer = 0;

  for (const h of heard) {
    if (!h) continue;
    let bestIndex = -1;
    let bestSim = 0;
    const end = Math.min(expected.length, pointer + window + 1);
    for (let i = pointer; i < end; i++) {
      const sim = similarity(h, expected[i]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestSim >= 0.6) {
      // Words jumped over were not heard — mark them skipped.
      for (let k = pointer; k < bestIndex; k++) {
        if (statuses[k] === undefined) statuses[k] = "missing";
      }
      statuses[bestIndex] = bestSim >= 0.84 ? "correct" : "close";
      pointer = bestIndex + 1;
    } else if (pointer < expected.length && statuses[pointer] === undefined) {
      // Heard something that doesn't fit here — flag the current word.
      statuses[pointer] = "wrong";
    }
  }

  return { statuses, pointer };
}
