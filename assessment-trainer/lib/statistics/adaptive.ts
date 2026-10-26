import { MATRIGMA_CATEGORIES, type Difficulty, type MatrigmaCategory } from "../matrigma/types";
import type { GroupStat } from "./stats";
import { Rng } from "../matrigma/rng";

/**
 * Adaptive practice: weight categories by weakness (low smoothed accuracy,
 * slow answers, little practice) and pick a difficulty per category from its
 * recent accuracy.
 */
export function categoryWeights(byCategory: GroupStat[]): Record<MatrigmaCategory, number> {
  const out = {} as Record<MatrigmaCategory, number>;
  const times = byCategory.map((g) => g.avgTimeMs).filter((t) => t > 0);
  const meanTime = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  for (const c of MATRIGMA_CATEGORIES) {
    const g = byCategory.find((x) => x.key === c);
    // Beta(2,2)-smoothed accuracy so a single attempt does not dominate.
    const acc = g ? (g.correct + 2) / (g.attempts + 4) : 0.5;
    const slow = g && meanTime ? Math.max(0, Math.min(1, g.avgTimeMs / meanTime - 1)) : 0;
    const unexplored = !g ? 0.3 : g.attempts < 5 ? 0.15 : 0;
    out[c] = Math.max(0.05, 1 - acc) + 0.3 * slow + unexplored;
  }
  return out;
}

export function difficultyFor(g: GroupStat | undefined): Difficulty {
  if (!g || g.attempts < 4) return "easy";
  if (g.accuracy >= 0.9) return g.attempts >= 12 ? "expert" : "hard";
  if (g.accuracy >= 0.75) return "medium";
  return "easy";
}

export function pickAdaptive(byCategory: GroupStat[], n: number, seed = Date.now()): { category: MatrigmaCategory; difficulty: Difficulty }[] {
  const w = categoryWeights(byCategory);
  const rng = new Rng(seed);
  const cats = Object.keys(w) as MatrigmaCategory[];
  const total = cats.reduce((s, c) => s + w[c], 0);
  const picks: { category: MatrigmaCategory; difficulty: Difficulty }[] = [];
  for (let i = 0; i < n; i++) {
    let r = rng.next() * total;
    let chosen = cats[cats.length - 1];
    for (const c of cats) {
      r -= w[c];
      if (r <= 0) {
        chosen = c;
        break;
      }
    }
    picks.push({ category: chosen, difficulty: difficultyFor(byCategory.find((g) => g.key === chosen)) });
  }
  return picks;
}
