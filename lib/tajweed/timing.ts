import { normalizeWord, similarity } from "@/lib/arabic";

// Whisper (verbose_json + word timestamps) returns words with start/end times.
export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface MaddCheck {
  refIndex: number;
  expected: string; // normalised expected word
  maddType: "natural" | "lazim";
  durationSec: number;
  expectedSec: number;
  ratio: number; // actual / expected
  verdict: "good" | "rushed" | "unknown";
}

export interface TimingReport {
  checks: MaddCheck[];
  speakingRate: number | null; // characters per second
  note: string;
}

interface ExpectedWord {
  norm: string;
  madd?: "natural" | "lazim";
  refIndex: number;
}

// Long vowels take extra time on top of the base letters. These factors scale
// the expected duration of a word relative to its plain character count.
const MADD_FACTOR: Record<"natural" | "lazim", number> = {
  natural: 1.2,
  lazim: 1.7,
};

/**
 * EXPERIMENTAL. Estimate whether elongated (madd) words were held long enough,
 * using Whisper word-level timestamps. Words are matched to the reference in
 * recitation order; a speaking-rate baseline is derived from the non-madd words
 * and each madd word is compared against its rate-adjusted expected duration.
 *
 * This is a timing heuristic, not a phonetic measurement — it catches obviously
 * rushed elongations (a learner skipping the 6-count madd in "aḍ-ḍāllīn") but
 * will not judge subtle differences. Treated as a hint, not a verdict.
 */
export function evaluateMadd(timed: TimedWord[], expected: ExpectedWord[]): TimingReport {
  const words = timed
    .map((w) => ({ ...w, norm: normalizeWord(w.word), dur: Math.max(0, w.end - w.start) }))
    .filter((w) => w.norm.length > 0 && w.dur > 0);

  if (words.length === 0) {
    return { checks: [], speakingRate: null, note: "No word-level timing was available." };
  }

  // Greedy in-order match of timed words to expected words.
  const matched: { exp: ExpectedWord; dur: number }[] = [];
  let wi = 0;
  for (const exp of expected) {
    let bestIdx = -1;
    let bestSim = 0;
    for (let k = wi; k < Math.min(words.length, wi + 3); k++) {
      const sim = similarity(exp.norm, words[k].norm);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = k;
      }
    }
    if (bestIdx >= 0 && bestSim >= 0.55) {
      matched.push({ exp, dur: words[bestIdx].dur });
      wi = bestIdx + 1;
    }
  }

  // Speaking rate (chars/sec) from words WITHOUT a madd, so the baseline isn't
  // inflated by the very elongations we want to judge.
  const plain = matched.filter((m) => !m.exp.madd && m.exp.norm.length > 0);
  const totalChars = plain.reduce((s, m) => s + m.exp.norm.length, 0);
  const totalTime = plain.reduce((s, m) => s + m.dur, 0);
  const speakingRate = totalChars > 0 && totalTime > 0 ? totalChars / totalTime : null;

  const checks: MaddCheck[] = [];
  for (const m of matched) {
    if (!m.exp.madd) continue;
    if (!speakingRate) {
      checks.push({
        refIndex: m.exp.refIndex,
        expected: m.exp.norm,
        maddType: m.exp.madd,
        durationSec: round(m.dur),
        expectedSec: 0,
        ratio: 0,
        verdict: "unknown",
      });
      continue;
    }
    const expectedSec = (m.exp.norm.length / speakingRate) * MADD_FACTOR[m.exp.madd];
    const ratio = m.dur / expectedSec;
    const verdict: MaddCheck["verdict"] = ratio >= 0.7 ? "good" : "rushed";
    checks.push({
      refIndex: m.exp.refIndex,
      expected: m.exp.norm,
      maddType: m.exp.madd,
      durationSec: round(m.dur),
      expectedSec: round(expectedSec),
      ratio: round(ratio),
      verdict,
    });
  }

  return {
    checks,
    speakingRate: speakingRate ? round(speakingRate) : null,
    note: "Experimental timing estimate from word-level timestamps.",
  };
}

function round(x: number): number {
  return Math.round(x * 100) / 100;
}
