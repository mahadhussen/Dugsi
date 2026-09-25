import type { MatrixProblem } from "../matrigma/types";
import type { FittedRule } from "./rules";
import { describePrediction, describeRule } from "./rules";
import { describeTransformRule, fitAlternation, fitTransformRules, type TransformRule } from "./transform-rules";
import type { ExplainedRule } from "./types";
import type { Axis } from "./lines";
import { fitRolling } from "./rolling";
import { fitSwap } from "./swap";

/**
 * Decision engine: builds the most complete *consistent* explanation.
 *
 * Candidate rules (best rule per attribute + whole-cell transformations) are
 * ordered by how much of the cell they explain (coverage) and then by
 * simplicity. A rule is kept only if at least one answer option satisfies it
 * together with every rule kept before it. Rules that contradict a more
 * complete / simpler explanation are rejected and reported.
 */

const COVERAGE: Record<string, string[]> = {
  objects: ["objects", "count", "positions", "shapes", "shape", "fill", "rotation", "slotCol", "slotRow", "sides"],
  positions: ["positions", "count", "slotCol", "slotRow"],
  shapes: ["shapes", "shape", "sides"],
  shape: ["shape", "sides"],
  sides: ["sides", "shape"],
};
const CELL_COVERAGE = 12;

/** Attributes whose values follow from a rule on `attr`. */
export function coveredBy(attr: string): string[] {
  return COVERAGE[attr] ?? [attr];
}

export interface CandidateRule {
  key: string;
  explained: ExplainedRule;
  optionScores: number[];
  coverage: number;
  complexity: number;
  validatedLines: number;
  weight: number;
  transform?: TransformRule;
  attr?: FittedRule;
}

export interface Decision {
  kept: CandidateRule[];
  rejected: CandidateRule[];
  candidates: number[];
  combined: number[];
}

const SAT = 0.85;

function fromAttr(r: FittedRule): CandidateRule {
  return {
    key: `${r.attr.name}/${r.kind}/${r.axis}`,
    explained: {
      text: describeRule(r),
      attribute: r.attr.name,
      kind: r.kind,
      axis: r.axis,
      complexity: r.complexity,
      validation: r.validated,
      prediction: describePrediction(r),
      informative: r.kind !== "constant",
    },
    optionScores: r.optionScores,
    coverage: (COVERAGE[r.attr.name] ?? [r.attr.name]).length,
    complexity: r.complexity,
    validatedLines: r.validated.length,
    weight: r.attr.weight,
    attr: r,
  };
}

function fromTransform(t: TransformRule, label: string): CandidateRule {
  const identity = t.steps.length > 0 && t.steps.every((s) => s.transform.family === "identity");
  return {
    key: `cell/${label}/${t.axis}`,
    explained: {
      text: t.steps.length ? describeTransformRule(t) : `In each ${t.axis === "sequence" ? "sequence" : "row"} the figures alternate A → B → A.`,
      attribute: "cell",
      kind: t.steps.length ? t.steps.map((s) => s.transform.id).join("+") : "alternation",
      axis: t.axis,
      complexity: t.complexity,
      validation: t.validated,
      informative: !identity,
    },
    optionScores: t.optionScores,
    coverage: CELL_COVERAGE,
    complexity: t.complexity,
    validatedLines: t.validated.length,
    weight: 2,
    transform: t,
  };
}

export function collectCandidates(problem: MatrixProblem, missing: number, attributeRules: FittedRule[]): CandidateRule[] {
  // Every validated attribute rule is a candidate; the greedy decision keeps
  // the consistent ones and reports conflicting alternatives.
  const out: CandidateRule[] = attributeRules.map(fromAttr);
  const axes: Axis[] = problem.rows === 1 ? ["sequence"] : ["row", "col", "diag"];
  for (const axis of axes) {
    const t = fitTransformRules(problem, missing, axis);
    if (t) out.push(fromTransform(t, "transform"));
  }
  const alt = fitAlternation(problem, missing);
  if (alt) out.push(fromTransform(alt, "alternation"));
  const sw = fitSwap(problem, missing);
  if (sw) out.push({ key: "cell/swap/row", explained: sw.explained, optionScores: sw.optionScores, coverage: CELL_COVERAGE, complexity: 2.5, validatedLines: sw.validated.length, weight: 2 });
  for (const r of fitRolling(problem, missing)) {
    out.push({
      key: `cell/rolling${r.step}/${r.axis}`,
      explained: r.explained,
      optionScores: r.optionScores,
      coverage: CELL_COVERAGE,
      complexity: r.explained.complexity,
      validatedLines: r.validated.length,
      weight: 2,
    });
  }
  return out;
}

export function decide(candidates: CandidateRule[], nOptions: number): Decision {
  const ordered = [...candidates].sort(
    (a, b) => b.coverage - a.coverage || a.complexity - b.complexity || b.validatedLines - a.validatedLines,
  );
  let alive = new Set(Array.from({ length: nOptions }, (_, i) => i));
  const kept: CandidateRule[] = [];
  const rejected: CandidateRule[] = [];
  for (const c of ordered) {
    const sat = new Set(c.optionScores.map((s, i) => (s >= SAT ? i : -1)).filter((i) => i >= 0));
    const inter = new Set([...alive].filter((i) => sat.has(i)));
    if (inter.size === 0) {
      rejected.push(c);
      continue;
    }
    kept.push(c);
    alive = inter;
  }
  const wsum = kept.reduce((s, c) => s + c.weight, 0) || 1;
  const combined = Array.from({ length: nOptions }, (_, i) => kept.reduce((s, c) => s + c.weight * c.optionScores[i], 0) / wsum);
  return { kept, rejected, candidates: [...alive], combined };
}
