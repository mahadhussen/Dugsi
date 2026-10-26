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
  /** Distracting elements on top of the rules (expert ladder only). */
  noise?: boolean;
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
  cutout: 0.2,
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

/**
 * "standard" starts in the middle and picks the item closest to the current
 * ability. "hard" is the expert ladder below. The reported level always uses
 * the same neutral prior, so results stay comparable between the two.
 */
export type TestStart = "standard" | "hard";

/**
 * Expert mix: every picture type whose expert questions combine two or three
 * rules (plus, for six of them, a variant with distracting elements), ranked
 * from easier to harder and cut into steps of three. A correct answer moves one
 * step up, a wrong answer one step down, and the item is drawn at random from
 * the step, avoiding picture types already used in the test. Every item in a
 * higher step ranks above every item in a lower one, so a correct answer
 * always leads to a harder question, but which one is not predictable.
 */
const MIX: [MatrigmaCategory, number, boolean][] = [
  // [category, rules at expert, distracting elements]
  ["rotation", 3, false], ["count", 3, false], ["position", 3, false], ["shape", 3, false], ["fill", 3, false],
  ["size", 3, false], ["direction", 3, false], ["overlay", 3, false], ["multi-rule", 3, false],
  ["petals", 2, false], ["linesdots", 2, false], ["hatch", 2, false], ["dotpath", 2, false], ["orbit", 2, false],
  ["emblem", 2, false], ["strip", 2, false], ["lined", 2, false], ["bands", 2, false], ["cutout", 2, false],
  ["shape", 3, true], ["fill", 3, true], ["rotation", 3, true], ["size", 3, true], ["direction", 3, true], ["multi-rule", 3, true],
];
const STEP_SIZE = 3;
export const LADDER: ItemType[] = MIX.map(([category, rules, noise]) => ({ category, rules, noise, score: (CATEGORY_OFFSET[category] ?? 0) + 0.25 * (rules - 2) + (noise ? 0.5 : 0) }))
  .sort((x, y) => x.score - y.score || x.category.localeCompare(y.category))
  .map(({ category, noise }, i) => ({ category, difficulty: "expert" as Difficulty, b: Math.round((1.2 + 0.07 * i) * 100) / 100, ...(noise ? { noise } : {}) }));
export const LADDER_STEPS = Math.ceil(LADDER.length / STEP_SIZE);
export const ladderStep = (step: number): ItemType[] => LADDER.slice(step * STEP_SIZE, (step + 1) * STEP_SIZE);

/** Step reached after these answers (starts at the bottom step). */
export function ladderRung(responses: TestResponse[]): number {
  let r = 0;
  for (const x of responses) r = x.correct ? Math.min(LADDER_STEPS - 1, r + 1) : Math.max(0, r - 1);
  return r;
}

function nextMixItem(responses: TestResponse[], rand: () => number): ItemType {
  const rung = ladderRung(responses);
  const used = new Set(responses.map((r) => r.category));
  const lastR = responses[responses.length - 1];
  const pick = (xs: ItemType[]) => xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))];
  const step = ladderStep(rung);
  const freshStep = step.filter((it) => !used.has(it.category));
  if (lastR?.correct) {
    // After a correct answer: always from the (higher) current step.
    const other = step.filter((it) => it.category !== lastR.category);
    return pick(freshStep.length ? freshStep : other.length ? other : step);
  }
  // At the start or after a wrong answer: a new picture type from this step or
  // any easier one (the two lowest steps when at the bottom).
  const below = LADDER.slice(0, Math.max(rung + 1, 2) * STEP_SIZE).filter((it) => !used.has(it.category));
  if (freshStep.length) return pick(freshStep);
  if (below.length) return pick(below);
  // Every nearby type used already: the new types closest to this step.
  const near = LADDER.map((it, i) => ({ it, d: Math.abs(Math.floor(i / STEP_SIZE) - rung) }))
    .filter((x) => !used.has(x.it.category))
    .sort((a, b) => a.d - b.d)
    .slice(0, STEP_SIZE)
    .map((x) => x.it);
  if (near.length) return pick(near);
  const other = step.filter((it) => it.category !== lastR?.category);
  return pick(other.length ? other : step);
}

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
export function nextItem(responses: TestResponse[], rand: () => number = Math.random, start: TestStart = "standard"): ItemType {
  if (start === "hard") return nextMixItem(responses, rand);
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
  /** 1-10 normalised score (sten: mean 5.5, SD 2) on the same scale. */
  sten: number;
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
    sten: Math.max(1, Math.min(10, Math.round(2 * theta + 5.5))),
    percentile: Math.round(normCdf(theta) * 100),
    correct: responses.filter((r) => r.correct).length,
    total: responses.length,
    avgTimeMs: responses.length ? responses.reduce((s, r) => s + r.timeMs, 0) / responses.length : 0,
    hardestSolved: solved.length ? order[Math.max(...solved)] : null,
    byCategory,
    weakest,
  };
}
