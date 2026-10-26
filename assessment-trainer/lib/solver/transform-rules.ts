import type { Cell, MatrixProblem } from "../matrigma/types";
import { cellSimilarity, cellSimilarityStrict } from "./similarity";
import { TRANSFORMS, type CellTransform } from "./transforms";
import { AXIS_WORD, buildLines, type Axis, type Line } from "./lines";

/**
 * Whole-cell transformation engine: finds, for each step k of a line
 * (cell k -> cell k+1), a transformation T_k that holds on every complete
 * pair at that step across all lines. Pairs from at least two independent
 * lines are required unless the problem is a single sequence.
 */

export interface TransformRule {
  axis: Axis;
  steps: { step: number; transform: CellTransform; pairs: string[] }[];
  complexity: number;
  validated: { label: string; ok: boolean }[];
  predicted: Cell | null;
  optionScores: number[];
  families: Set<string>;
}

const PAIR_THRESHOLD = 0.9;

/** Option score: ~1 when the option matches exactly, graded below otherwise. */
function strictScore(expected: Cell, option: Cell): number {
  const strict = cellSimilarityStrict(expected, option);
  if (strict >= PAIR_THRESHOLD) return strict;
  return Math.max(0, Math.min(0.75, cellSimilarity(expected, option) - 0.2));
}

function findTransform(
  pairs: [Cell, Cell][],
  candidates: CellTransform[],
): CellTransform[] {
  return candidates.filter((t) => pairs.every(([a, b]) => cellSimilarityStrict(t.apply(a), b) >= PAIR_THRESHOLD));
}

export function fitTransformRules(
  problem: MatrixProblem,
  missing: number,
  axis: Axis,
  allowed: (t: CellTransform) => boolean = () => true,
): TransformRule | null {
  const cells = problem.cells;
  const candidates = TRANSFORMS.filter(allowed);
  let lines: Line[];
  if (axis === "sequence") {
    if (problem.rows !== 1) return null;
    lines = [{ axis, index: 0, cells: cells.map((_, i) => i), label: "Sequence" }];
  } else {
    lines = buildLines(problem, axis);
  }
  if (!lines.length) return null;
  const target = lines.find((l) => l.cells.includes(missing));
  if (!target) return null;
  const len = target.cells.length;
  const k = target.cells.indexOf(missing);
  const sequence = axis === "sequence";

  // For sequences one transformation must explain every step.
  const stepIndices = sequence ? [-1] : Array.from({ length: len - 1 }, (_, s) => s);
  const steps: TransformRule["steps"] = [];
  const validated: { label: string; ok: boolean }[] = [];

  // Prefer one uniform transformation across all steps if possible.
  const allPairs: [Cell, Cell][] = [];
  const allLabels: string[] = [];
  for (const l of lines) {
    for (let s = 0; s + 1 < l.cells.length; s++) {
      const a = cells[l.cells[s]];
      const b = cells[l.cells[s + 1]];
      if (a && b) {
        allPairs.push([a, b]);
        allLabels.push(`${l.label}: ${s + 1}→${s + 2}`);
      }
    }
  }
  const uniform = findTransform(allPairs, candidates).sort((a, b) => a.complexity - b.complexity);
  const minPairs = sequence ? 2 : 3;
  let perStep: Map<number, CellTransform> = new Map();
  if (uniform.length && allPairs.length >= minPairs) {
    for (let s = 0; s < len - 1; s++) perStep.set(s, uniform[0]);
    steps.push({ step: -1, transform: uniform[0], pairs: allLabels });
  } else if (!sequence && axis !== "diag") {
    // Step-specific transformations only along rows/columns; diagonals must be
    // explained by one uniform transformation (too few pairs otherwise).
    for (const s of stepIndices) {
      const pairs: [Cell, Cell][] = [];
      const labels: string[] = [];
      for (const l of lines) {
        const a = cells[l.cells[s]];
        const b = cells[l.cells[s + 1]];
        if (a && b) {
          pairs.push([a, b]);
          labels.push(l.label);
        }
      }
      if (pairs.length < 2) continue;
      const found = findTransform(pairs, candidates).sort((a, b) => a.complexity - b.complexity);
      if (!found.length) continue;
      perStep.set(s, found[0]);
      steps.push({ step: s, transform: found[0], pairs: labels });
    }
  }
  // Need a transformation for a step touching the missing cell.
  const into = k > 0 ? perStep.get(k - 1) : undefined;
  const outOf = k < len - 1 ? perStep.get(k) : undefined;
  if (!into && !outOf) return null;
  // Pure identity everywhere is only interesting as "constant" evidence.
  const prev = k > 0 ? cells[target.cells[k - 1]] : null;
  const next = k < len - 1 ? cells[target.cells[k + 1]] : null;
  const predicted = into && prev ? into.apply(prev) : null;

  const optionScores = problem.options.map((o) => {
    const parts: number[] = [];
    if (into && prev) parts.push(strictScore(into.apply(prev), o));
    if (outOf && next) parts.push(strictScore(outOf.apply(o), next));
    if (!parts.length) return 0;
    return Math.min(...parts);
  });

  for (const l of lines) {
    if (l === target) continue;
    validated.push({ label: l.label, ok: true });
  }
  const used = new Set(steps.map((s) => s.transform.id));
  const complexity = [...used].reduce((sum, id) => sum + (TRANSFORMS.find((t) => t.id === id)?.complexity ?? 2), 0) + (axis === "col" ? 0.1 : axis === "diag" ? 0.4 : 0);
  return {
    axis,
    steps,
    complexity,
    validated,
    predicted,
    optionScores,
    families: new Set(steps.map((s) => s.transform.family)),
  };
}

export function describeTransformRule(r: TransformRule): string {
  const where = r.axis === "sequence" ? "Along the sequence" : `In each ${AXIS_WORD[r.axis]}`;
  if (r.steps.length === 1 && r.steps[0].step === -1) {
    return `${where} each figure is the previous one ${r.steps[0].transform.describe}.`;
  }
  const parts = r.steps.map((s) => `cell ${s.step + 1} → cell ${s.step + 2}: ${s.transform.describe}`);
  return `${where}: ${parts.join("; ")}.`;
}

/** Alternation of whole cells: cell i equals cell i-2 while neighbours differ. */
export function fitAlternation(problem: MatrixProblem, missing: number): TransformRule | null {
  const axis: Axis = problem.rows === 1 ? "sequence" : "row";
  const lines = problem.rows === 1 ? [{ axis, index: 0, cells: problem.cells.map((_, i) => i), label: "Sequence" }] : buildLines(problem, "row");
  if (!lines.length || lines[0].cells.length < 3) return null;
  const target = lines.find((l) => l.cells.includes(missing));
  if (!target) return null;
  const validated: { label: string; ok: boolean }[] = [];
  let pairs = 0;
  for (const l of lines) {
    for (let i = 2; i < l.cells.length; i++) {
      const a = problem.cells[l.cells[i - 2]];
      const b = problem.cells[l.cells[i]];
      const mid = problem.cells[l.cells[i - 1]];
      if (!a || !b || !mid) continue;
      if (cellSimilarityStrict(a, b) < PAIR_THRESHOLD || cellSimilarityStrict(a, mid) >= PAIR_THRESHOLD) return null;
      pairs++;
    }
    if (l !== target) validated.push({ label: l.label, ok: true });
  }
  if (pairs < (problem.rows === 1 ? 2 : 2)) return null;
  const k = target.cells.indexOf(missing);
  const partner = k >= 2 ? problem.cells[target.cells[k - 2]] : k + 2 < target.cells.length ? problem.cells[target.cells[k + 2]] : null;
  if (!partner) return null;
  const optionScores = problem.options.map((o) => strictScore(partner, o));
  return {
    axis,
    steps: [],
    complexity: 2,
    validated,
    predicted: partner,
    optionScores,
    families: new Set(["alternation"]),
  };
}
