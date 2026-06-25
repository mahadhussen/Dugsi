import { fatiha, flattenWords } from "@/lib/quran/fatiha";
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
 * recitation feedback against Surah Al-Fatiha.
 */
export function analyzeRecitation(
  transcript: string,
  timedWords: TimedWord[],
  engine: string,
): RecitationFeedback {
  const flat = flattenWords(fatiha);
  const expectedTokens = flat.map((f) => f.word.uthmani);
  const heardTokens = tokenize(transcript);

  const alignment = alignRecitation(expectedTokens, heardTokens);

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

function buildSummary(alignment: AlignmentResult, rushed: number, maddTotal: number): string {
  const total = alignment.words.length;
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
