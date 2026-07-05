import { flattenAyat, type Ayah } from "@/lib/quran/types";
import { alignRecitation, type AlignmentResult } from "@/lib/align";
import { tokenize, normalizeWord, similarity } from "@/lib/arabic";
import { evaluateMadd, type TimingReport, type TimedWord } from "@/lib/tajweed/timing";

// Above this many expected words, align only a window around where the reciter
// actually recited. The full O(n·m) alignment over a whole long surah (e.g. all
// 6118 words of Al-Baqarah) would allocate a huge matrix and crash phones.
const WINDOW_THRESHOLD = 600;

// How many heard words to slide when locating the recited passage. A short
// refrain matches in many places (Ar-Rahman repeats a phrase dozens of times),
// but a long window only aligns well at the true offset, so 5 was too few. A
// hint from the live tracker (roughly where the reciter actually was) breaks any
// remaining tie between genuinely identical repetitions.
const ANCHOR_PROBES = 16;
const HINT_BIAS = 0.02; // per word of distance from the live-tracker hint

/**
 * Find where a recitation begins inside a long expected sequence. Slides a
 * window of heard words across the reference and scores each start by total
 * similarity, so the correct offset (where the whole passage matches) wins over
 * a shorter refrain match elsewhere. An optional `hint` (a reference index the
 * live tracker matched) nudges the choice toward where the reciter was.
 * Exported for testing.
 */
export function bestAnchor(expectedNorm: string[], heard: string[], hint?: number): number {
  const n = expectedNorm.length;
  if (n === 0) return 0;
  const probes = heard.slice(0, ANCHOR_PROBES);
  if (probes.length === 0) {
    return hint != null ? Math.max(0, Math.min(n - 1, Math.round(hint))) : 0;
  }
  const limit = Math.max(0, n - probes.length);
  let bestStart = 0;
  let bestScore = -Infinity;
  for (let s = 0; s <= limit; s++) {
    let score = 0;
    for (let j = 0; j < probes.length && s + j < n; j++) {
      score += similarity(probes[j], expectedNorm[s + j]);
    }
    if (hint != null) score -= HINT_BIAS * Math.abs(s - hint);
    if (score > bestScore) {
      bestScore = score;
      bestStart = s;
    }
  }
  return bestStart;
}

export interface RecitationFeedback {
  transcript: string;
  engine: string;
  alignment: AlignmentResult;
  timing: TimingReport;
  score: number; // 0..100 overall
  summary: string;
  /** Fraction of the attempted span the recogniser actually matched (0..1). */
  matchRate: number;
  /** Whether we heard clearly enough to show a scored verdict. When false the UI
   *  must NOT show a score or red marks — a correct reciter judged as wrong
   *  destroys trust. It shows an honest "could not hear you" state instead. */
  reliable: boolean;
}

// Confidence thresholds for showing a scored verdict. Deliberately conservative:
// wrong feedback on someone's recitation is worse than asking them to try again.
const MIN_HEARD_WORDS = 3; // too little said to judge anything
const MIN_SPAN_WORDS = 2; // the attempted span must be real
const MIN_MATCH_RATE = 0.45; // below this the recogniser clearly failed, not the reciter

/**
 * Turn a raw transcription (text + optional word timings) into structured
 * recitation feedback against a set of expected ayat (one practice section).
 */
export function analyzeRecitation(
  ayat: Ayah[],
  transcript: string,
  timedWords: TimedWord[],
  engine: string,
  /** Reference index the live tracker matched, used as an anchor prior for long
   *  surahs so a repeated phrase does not lock the window onto the wrong copy. */
  anchorHint?: number,
): RecitationFeedback {
  const flat = flattenAyat(ayat);
  const expectedTokens = flat.map((f) => f.word.uthmani);
  const heardTokens = tokenize(transcript);

  // For long surahs, bound the alignment to a window around the recited passage
  // so the DP matrix stays small (avoids OOM crashes on mobile).
  let windowStart = 0;
  let windowTokens = expectedTokens;
  if (expectedTokens.length > WINDOW_THRESHOLD && heardTokens.length > 0) {
    const expectedNorm = expectedTokens.map(normalizeWord);
    const anchor = bestAnchor(expectedNorm, heardTokens, anchorHint);
    const pad = 30;
    windowStart = Math.max(0, anchor - pad);
    const windowEnd = Math.min(expectedTokens.length, anchor + heardTokens.length + pad);
    windowTokens = expectedTokens.slice(windowStart, windowEnd);
  }

  const windowAlignment = alignRecitation(windowTokens, heardTokens);
  // Map window-local indices back to global word indices.
  const fullAlignment: AlignmentResult =
    windowStart === 0
      ? windowAlignment
      : {
          ...windowAlignment,
          words: windowAlignment.words.map((w) => ({ ...w, refIndex: w.refIndex + windowStart })),
        };

  // The reciter may recite only part of a long, scrollable surah. Scope the
  // result to the span they actually attempted (first..last matched word) so the
  // unrecited verses aren't counted as "skipped".
  const alignment = scopeToAttempted(fullAlignment);

  const expectedForTiming = flat.map((f, i) => ({
    norm: tokenize(f.word.uthmani)[0] ?? "",
    madd: f.word.madd,
    refIndex: i,
  }));
  const timing = evaluateMadd(timedWords, expectedForTiming);

  // Score: recitation accuracy is the backbone; rushed madds shave a few points.
  const rushed = timing.checks.filter((c) => c.verdict === "rushed").length;
  const maddTotal = timing.checks.length;
  const accuracyPart = alignment.accuracy * 100;
  const maddPenalty = maddTotal > 0 ? (rushed / maddTotal) * 10 : 0;
  const score = Math.max(0, Math.round(accuracyPart - maddPenalty));

  // Confidence: how much of the attempted span the recogniser actually matched.
  // If it barely matched, marking the rest wrong/skipped would be a false
  // accusation, so the verdict is withheld.
  const spanWords = alignment.words.length;
  const matched = alignment.words.filter((w) => w.status === "correct" || w.status === "close").length;
  const matchRate = spanWords > 0 ? matched / spanWords : 0;
  const reliable =
    heardTokens.length >= MIN_HEARD_WORDS && spanWords >= MIN_SPAN_WORDS && matchRate >= MIN_MATCH_RATE;

  return {
    transcript,
    engine,
    alignment,
    timing,
    score,
    summary: buildSummary(alignment, rushed, maddTotal),
    matchRate,
    reliable,
  };
}

/**
 * Restrict an alignment to the contiguous span the reciter actually attempted —
 * from the first to the last word that was matched to something they said.
 * Words outside that span are dropped (not penalised), so reciting a few verses
 * of a long surah is scored only on those verses.
 */
function scopeToAttempted(full: AlignmentResult): AlignmentResult {
  const matched = full.words.filter((w) => w.heard !== null);
  if (matched.length === 0) {
    return { words: [], extras: full.extras, accuracy: 0 };
  }
  const lo = matched[0].refIndex;
  const hi = matched[matched.length - 1].refIndex;
  const words = full.words.filter((w) => w.refIndex >= lo && w.refIndex <= hi);
  const correct = words.filter((w) => w.status === "correct").length;
  const accuracy = words.length === 0 ? 0 : correct / words.length;
  return { words, extras: full.extras, accuracy };
}

function buildSummary(alignment: AlignmentResult, rushed: number, maddTotal: number): string {
  const total = alignment.words.length;
  if (total === 0) {
    return "We couldn't match your recitation to these verses. Try reciting a passage you can see on screen.";
  }
  const correct = alignment.words.filter((w) => w.status === "correct").length;
  const missing = alignment.words.filter((w) => w.status === "missing").length;
  const wrong = alignment.words.filter((w) => w.status === "wrong").length;

  const parts: string[] = [];
  parts.push(`${correct}/${total} words recited correctly.`);
  if (missing > 0) parts.push(`${missing} word${missing > 1 ? "s" : ""} skipped.`);
  if (wrong > 0) parts.push(`${wrong} word${wrong > 1 ? "s" : ""} need work.`);
  if (maddTotal > 0 && rushed > 0) {
    parts.push(`${rushed} elongation${rushed > 1 ? "s" : ""} may have been rushed.`);
  } else if (maddTotal > 0) {
    parts.push("Elongations look well held.");
  }
  return parts.join(" ");
}
