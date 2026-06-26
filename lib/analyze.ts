import { flattenAyat, type Ayah } from "@/lib/quran/types";
import { alignRecitation, type AlignmentResult } from "@/lib/align";
import { tokenize } from "@/lib/arabic";
import { evaluateMadd, type TimingReport, type TimedWord } from "@/lib/tajweed/timing";

export interface RecitationFeedback {
  transcript: string;
  engine: string;
  alignment: AlignmentResult;
  timing: TimingReport;
  score: number; // 0..100 overall
  summary: string;
}

/**
 * Turn a raw transcription (text + optional word timings) into structured
 * recitation feedback against a set of expected ayat (one practice section).
 */
export function analyzeRecitation(
  ayat: Ayah[],
  transcript: string,
  timedWords: TimedWord[],
  engine: string,
): RecitationFeedback {
  const flat = flattenAyat(ayat);
  const expectedTokens = flat.map((f) => f.word.uthmani);
  const heardTokens = tokenize(transcript);

  const fullAlignment = alignRecitation(expectedTokens, heardTokens);

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

  return {
    transcript,
    engine,
    alignment,
    timing,
    score,
    summary: buildSummary(alignment, rushed, maddTotal),
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
