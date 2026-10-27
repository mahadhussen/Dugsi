// Each word of the Uthmani text in the vowel model's spelling (simple script
// with full vowel marks), as scripts/build-ctc-text.ts wrote it to
// lib/quran/ctc/{surah}.json. Per verse, one string per Uthmani word; a word
// Uthmani writes joined holds two or more model words separated by a space.

import { editDistance, normalizeWord } from "@/lib/arabic";
import { modernSpelling, spellingKey } from "@/lib/follow/spelling";

/** Load a surah's model-spelling words: verses × Uthmani words. */
export async function loadCtcText(surah: number): Promise<string[][]> {
  const mod = await import(`./ctc/${surah}.json`);
  return mod.default as string[][];
}

// Two more Uthmani forms simple script writes out: alif maqsura with a dagger
// alif inside a word is alif (ءَاتَىٰنِۦَ = آتَانِيَ), and a small yeh that
// carries a vowel is a yeh.
const keyOfUthmani = (w: string) =>
  spellingKey(normalizeWord(modernSpelling(w.replace(/\u0649\u0670(?=\p{L})/gu, "ا").replace(/\u06E6(?=[\u064B-\u0652])/g, "ي"))));
const keyOfModel = (w: string) => spellingKey(normalizeWord(w));

/** How far apart two spelling keys are, 0 (same) to 1. */
function distance(a: string, b: string): number {
  const n = Math.max(a.length, b.length);
  return n === 0 ? 0 : editDistance(a, b) / n;
}

/** Above this, an Uthmani word and its model words are not the same word. */
const MAX_DISTANCE = 0.34;

/** Whether two spelling keys are the same word: close, or one letter apart. */
function same(a: string, b: string): number | null {
  const d = distance(a, b);
  if (d <= MAX_DISTANCE) return d;
  return editDistance(a, b) <= 1 ? d : null; // رءا / رأى: short words, one letter
}

/** What a join costs, against at most MAX_DISTANCE for a word pair. */
const JOIN = 0.5;

// Uthmani words × model words a step may join: one to one, one Uthmani word
// for two or three model words (يَٰقَوۡمِ = يَا قَوْمِ), or two for one.
const STEPS: [number, number][] = [
  [1, 1],
  [1, 2],
  [1, 3],
  [2, 1],
];

/**
 * Line up one verse: for each Uthmani word, the model words it stands for
 * (space-separated), "" for the second of two Uthmani words that the model
 * writes as one, or null when the two texts do not line up.
 */
export function alignSpellings(uthmani: readonly string[], model: readonly string[]): string[] | null {
  const n = uthmani.length;
  const m = model.length;
  const INF = Number.POSITIVE_INFINITY;
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(INF));
  const step = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(-1));
  cost[0][0] = 0;
  const uk = uthmani.map(keyOfUthmani);
  const mk = model.map(keyOfModel);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      if (cost[i][j] === INF) continue;
      STEPS.forEach(([gu, gm], si) => {
        if (i + gu > n || j + gm > m) return;
        const d = same(uk.slice(i, i + gu).join(""), mk.slice(j, j + gm).join(""));
        if (d === null) return;
        // A join only where the word counts force one: never to save a letter
        // (it once paired إِلَّا with اللَّائِي in 58:2).
        const c = cost[i][j] + d + (gu + gm - 2) * JOIN;
        if (c < cost[i + gu][j + gm]) {
          cost[i + gu][j + gm] = c;
          step[i + gu][j + gm] = si;
        }
      });
    }
  if (cost[n][m] === INF) return null;
  const out = new Array<string>(n);
  let i = n;
  let j = m;
  while (i > 0) {
    const [gu, gm] = STEPS[step[i][j]];
    out[i - gu] = model.slice(j - gm, j).join(" ");
    if (gu === 2) out[i - 1] = "";
    i -= gu;
    j -= gm;
  }
  return out;
}
