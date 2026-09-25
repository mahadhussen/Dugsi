import { MATRIGMA_CATEGORIES, type Difficulty, type MatrigmaCategory } from "../matrigma/types";

/**
 * Adaptive ability test (computerised adaptive testing with a Rasch model).
 *
 * Every (category, difficulty) combination is an item type with a difficulty
 * parameter b on the logit scale. After each answer the ability θ is estimated
 * (EAP with a standard normal prior) and the next item is the one whose b is
 * closest to θ, which is where an answer tells the most. The scale is our own:
 * results are an estimate on these synthetic questions, not a norm-referenced
 * score from any commercial test.
 */

export interface ItemType {
  category: MatrigmaCategory;
  difficulty: Difficulty;
  b: number;
}

const BASE: Record<Difficulty, number> = { easy: -1.6, medium: -0.5, hard: 0.6, expert: 1.6 };
const CATEGORY_OFFSET: Partial<Record<MatrigmaCategory, number>> = {
  alternation: -0.3,
  shape: -0.2,
  fill: -0.2,
  reflection: 0.2,
  composition: 0.3,
  overlay: 0.4,
  rolling: 0.2,
  petals: 0.1,
  linesdots: 0.3,
  hatch: 0.4,
  swap: 0.3,
  dotpath: 0.3,
  orbit: 0.1,
  emblem: 0.2,
  strip: -0.3,
  lined: 0.1,
  bands: 0.4,
  "multi-rule": 0.5,
};

export const ITEM_TYPES: ItemType[] = MATRIGMA_CATEGORIES.flatMap((category) =>
  (["easy", "medium", "hard", "expert"] as Difficulty[])
    .filter((d) => category !== "multi-rule" || d === "hard" || d === "expert")
    .map((difficulty) => ({ category, difficulty, b: Math.round((BASE[difficulty] + (CATEGORY_OFFSET[category] ?? 0)) * 100) / 100 })),
);

export interface TestResponse {
  category: MatrigmaCategory;
  difficulty: Difficulty;
  b: number;
  correct: boolean;
  timeMs: number;
}

const GRID = Array.from({ length: 161 }, (_, i) => -4 + i * 0.05);
const p = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));

/** Expected a posteriori ability and its standard error. */
export function estimateAbility(responses: TestResponse[]): { theta: number; se: number } {
  let sw = 0;
  let s1 = 0;
  let s2 = 0;
  for (const t of GRID) {
    let lw = -0.5 * t * t;
    for (const r of responses) lw += Math.log(r.correct ? p(t, r.b) : 1 - p(t, r.b));
    const w = Math.exp(lw);
    sw += w;
    s1 += w * t;
    s2 += w * t * t;
  }
  const theta = s1 / sw;
  return { theta, se: Math.sqrt(Math.max(0, s2 / sw - theta * theta)) };
}

/**
 * Choose the next item type: difficulty closest to the current ability, with a
 * little randomness among near-equal items and no category twice in a row
 * (and not more than twice in the whole test when avoidable).
 */
export function nextItem(responses: TestResponse[], rand: () => number = Math.random): ItemType {
  const { theta } = estimateAbility(responses);
  const last = responses[responses.length - 1]?.category;
  const used = new Map<string, number>();
  for (const r of responses) used.set(r.category, (used.get(r.category) ?? 0) + 1);
  const scored = ITEM_TYPES.map((it) => ({
    it,
    s: Math.abs(it.b - theta) + (it.category === last ? 5 : 0) + 0.4 * (used.get(it.category) ?? 0) + rand() * 0.25,
  })).sort((a, b) => a.s - b.s);
  return scored[0].it;
}

export interface AbilityReport {
  theta: number;
  se: number;
  /** 1-9, mean 5, SD 2 on this tool's own scale. */
  stanine: number;
  /** Share of a standard-normal reference group below this ability (own scale, not a real norm). */
  percentile: number;
  correct: number;
  total: number;
  avgTimeMs: number;
  hardestSolved: Difficulty | null;
  byCategory: { category: MatrigmaCategory; correct: number; total: number }[];
  weakest: MatrigmaCategory[];
}

function normCdf(x: number): number {
  // Abramowitz–Stegun approximation.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - q : q;
}

export function abilityReport(responses: TestResponse[]): AbilityReport {
  const { theta, se } = estimateAbility(responses);
  const byCat = new Map<MatrigmaCategory, { correct: number; total: number }>();
  for (const r of responses) {
    const g = byCat.get(r.category) ?? { correct: 0, total: 0 };
    g.total++;
    if (r.correct) g.correct++;
    byCat.set(r.category, g);
  }
  const order: Difficulty[] = ["easy", "medium", "hard", "expert"];
  const solved = responses.filter((r) => r.correct).map((r) => order.indexOf(r.difficulty));
  const byCategory = [...byCat.entries()].map(([category, g]) => ({ category, ...g }));
  const weakest = byCategory
    .filter((g) => g.correct < g.total)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
    .slice(0, 3)
    .map((g) => g.category);
  return {
    theta,
    se,
    stanine: Math.max(1, Math.min(9, Math.round(2 * theta + 5))),
    percentile: Math.round(normCdf(theta) * 100),
    correct: responses.filter((r) => r.correct).length,
    total: responses.length,
    avgTimeMs: responses.length ? responses.reduce((s, r) => s + r.timeMs, 0) / responses.length : 0,
    hardestSolved: solved.length ? order[Math.max(...solved)] : null,
    byCategory,
    weakest,
  };
}
