import { normalizeWord, similarity } from "@/lib/arabic";

export type WordStatus = "correct" | "close" | "wrong" | "missing";

export interface AlignedWord {
  /** Index into the expected (reference) word list. */
  refIndex: number;
  expected: string; // normalised expected word
  heard: string | null; // normalised word the reciter actually said (null = skipped)
  status: WordStatus;
  score: number; // 0..1 similarity for the matched pair
}

export interface AlignmentResult {
  words: AlignedWord[];
  extras: string[]; // words the reciter said that don't belong (normalised)
  accuracy: number; // 0..1 over the reference words
}

const MATCH_THRESHOLD = 0.84; // >= counts as a correct word
const CLOSE_THRESHOLD = 0.6; // >= counts as "close" (minor slip)

/**
 * Needleman–Wunsch global alignment of heard words against expected words.
 * Substitution score is the fuzzy similarity of the two normalised words; gaps
 * (insertions/deletions) are penalised so that skipped or extra words surface.
 */
export function alignRecitation(expectedRaw: string[], heardRaw: string[]): AlignmentResult {
  const expected = expectedRaw.map(normalizeWord);
  const heard = heardRaw.map(normalizeWord).filter((w) => w.length > 0);

  const n = expected.length;
  const m = heard.length;
  const GAP = -0.6;

  // DP score + backtrace matrices.
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const back: string[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(""));

  for (let i = 1; i <= n; i++) {
    score[i][0] = score[i - 1][0] + GAP;
    back[i][0] = "up"; // expected word skipped
  }
  for (let j = 1; j <= m; j++) {
    score[0][j] = score[0][j - 1] + GAP;
    back[0][j] = "left"; // extra heard word
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = similarity(expected[i - 1], heard[j - 1]);
      const diag = score[i - 1][j - 1] + (sim - 0.4); // centre score so good matches are positive
      const up = score[i - 1][j] + GAP;
      const left = score[i][j - 1] + GAP;
      const best = Math.max(diag, up, left);
      score[i][j] = best;
      back[i][j] = best === diag ? "diag" : best === up ? "up" : "left";
    }
  }

  // Backtrace.
  const words: AlignedWord[] = [];
  const extras: string[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const move = i === 0 ? "left" : j === 0 ? "up" : back[i][j];
    if (move === "diag") {
      const sim = similarity(expected[i - 1], heard[j - 1]);
      words.push({
        refIndex: i - 1,
        expected: expected[i - 1],
        heard: heard[j - 1],
        status: classify(sim),
        score: sim,
      });
      i--;
      j--;
    } else if (move === "up") {
      words.push({
        refIndex: i - 1,
        expected: expected[i - 1],
        heard: null,
        status: "missing",
        score: 0,
      });
      i--;
    } else {
      extras.push(heard[j - 1]);
      j--;
    }
  }

  words.reverse();
  extras.reverse();

  const correct = words.filter((w) => w.status === "correct").length;
  const accuracy = n === 0 ? 0 : correct / n;

  return { words, extras, accuracy };
}

function classify(sim: number): WordStatus {
  if (sim >= MATCH_THRESHOLD) return "correct";
  if (sim >= CLOSE_THRESHOLD) return "close";
  return "wrong";
}
