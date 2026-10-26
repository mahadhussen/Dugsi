import type { MatrixProblem } from "../matrigma/types";
import { missingIndex, OPTION_LABELS } from "../matrigma/types";
import { cellFeatures } from "./features";
import { fitAttributeRules, selectBestPerAttribute } from "./rules";
import { ATTRIBUTES, glyphAttributes } from "./attributes";
import { collectCandidates, coveredBy, decide } from "./decision";
import { STRATEGIES, type StrategyContext } from "./strategies";
import { synthesizeCell } from "./synthesize";
import { calibrate, computeConfidence, UNCERTAIN_THRESHOLD, type CalibrationBin } from "./confidence";
import { buildExplanation } from "./explain";
import type { Solution, StrategyResult } from "./types";
import type { AttrValue } from "./attributes";

export interface SolveOptions {
  /** Quality of the visual extraction in [0,1]; 1 for structured input. */
  extractionQuality?: number;
  calibration?: CalibrationBin[];
}

const TOP_EPS = 0.05;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Run every independent strategy, combine their verdicts and compute a
 * confidence. Never guesses: returns status "unsolved" (answer null) when no
 * validated rule explains the matrix, and "uncertain" when the evidence is weak
 * or several options are equally consistent.
 */
export function solveMatrix(problem: MatrixProblem, opts: SolveOptions = {}): Solution {
  const t0 = now();
  const missing = missingIndex(problem);
  const nOpt = problem.options.length;
  if (missing < 0 || nOpt === 0) {
    return emptySolution(problem, "No missing cell or no answer options were found.", t0);
  }
  const features = problem.cells.map((c) => (c ? cellFeatures(c) : null));
  const optionFeatures = problem.options.map(cellFeatures);
  const attributeRules = fitAttributeRules({ problem, features, optionFeatures, missing }, [...ATTRIBUTES, ...glyphAttributes(problem)]);
  const ctx: StrategyContext = { problem, missing, features, optionFeatures, attributeRules };

  // Strategies are independent pure functions; run each and time it.
  const strategies: StrategyResult[] = STRATEGIES.map((s) => {
    const ts = now();
    const r = s.run(ctx);
    const max = Math.max(...r.optionScores);
    const min = Math.min(...r.optionScores);
    const informative = r.applicable && max - min > 0.05;
    const topOptions = informative ? r.optionScores.map((v, i) => (v >= max - TOP_EPS ? i : -1)).filter((i) => i >= 0) : [];
    const validation = Math.min(1, r.validatedLines / 2);
    let weight = informative ? validation / (1 + 0.2 * r.complexity) : 0;
    if (s.id === "two_rule_combination") weight *= 2;
    return { id: s.id, label: s.label, ...r, informative, topOptions, weight, durationMs: now() - ts };
  });

  const active = strategies.filter((s) => s.informative && s.weight > 0);
  const decision = decide(collectCandidates(problem, missing, attributeRules), nOpt);
  const informativeKept = decision.kept.filter((c) => c.explained.informative || decision.kept.length > 0);
  if (!active.length || !informativeKept.length) {
    return emptySolution(problem, "No rule could be validated on the complete rows/columns.", t0, strategies);
  }
  const combined = decision.combined;
  const alive = new Set(decision.candidates);
  const order = combined
    .map((v, i) => ({ v: alive.has(i) ? v : v * 0.5, i }))
    .sort((a, b) => b.v - a.v);
  const best = order[0];
  const second = order[1] ?? { v: 0, i: -1 };
  const candidates = decision.candidates.length > 1 ? decision.candidates : [best.i];
  const tie = candidates.length > 1;

  const allW = [...decision.kept, ...decision.rejected].reduce((s, c) => s + c.weight * (c.explained.informative ? 1 : 0.3), 0) || 1;
  const rejW = decision.rejected.reduce((s, c) => s + c.weight * (c.explained.informative ? 1 : 0.3), 0);
  const consistency = 1 - rejW / allW;
  const wsum = active.reduce((s, x) => s + x.weight, 0);
  const agreement = active.filter((s) => s.topOptions.includes(best.i)).reduce((s, x) => s + x.weight, 0) / wsum;
  const keptInf = decision.kept.filter((c) => c.explained.informative);
  const validation = keptInf.length
    ? Math.min(...keptInf.map((c) => Math.min(1, c.validatedLines / 2)))
    : Math.min(1, Math.max(...decision.kept.map((c) => c.validatedLines)) / 2);
  const margin = Math.min(1, (best.v - second.v) / 0.3);
  const extraction = opts.extractionQuality ?? 1;
  const factors = { consistency, validation, similarity: best.v, margin, agreement, extraction };
  // Ambiguity: a validated, informative alternative rule that points to a
  // different option. The data support two explanations — do not overclaim.
  // A rejected rule is not a competing explanation when a kept attribute rule
  // already determines its attribute more completely (e.g. "A ∪ B = C" on the
  // exact object sets also fixes the number of objects).
  const subsumed = (c: (typeof decision.rejected)[number]) =>
    decision.kept.some(
      (k) => k.attr && k.explained.informative && k.coverage > c.coverage && coveredBy(k.attr.attr.name).includes(c.explained.attribute),
    );
  // Diagonal readings are secondary: they never override a row/column rule.
  const ambiguous = decision.rejected.some(
    (c) => c.explained.informative && c.validatedLines >= 2 && c.explained.axis !== "diag" && !subsumed(c) && c.optionScores.some((v, i) => v >= 0.85 && i !== best.i),
  );
  const raw = computeConfidence({ ...factors, tie }) * (ambiguous ? 0.7 : 1);
  // Options favoured by the validated-but-rejected alternatives: when the data
  // support two explanations we list the candidates instead of picking one.
  const altOptions = ambiguous
    ? decision.rejected
        .filter((c) => c.explained.informative && c.validatedLines >= 2 && c.explained.axis !== "diag" && !subsumed(c))
        .flatMap((c) => c.optionScores.map((v, i) => (v >= 0.85 && i !== best.i ? i : -1)))
        .filter((i) => i >= 0)
    : [];
  const confidence = calibrate(raw, opts.calibration);

  const validated = !tie && decision.kept.every((c) => c.optionScores[best.i] >= 0.85) && keptInf.length > 0;
  const status: Solution["status"] =
    tie || ambiguous || confidence < UNCERTAIN_THRESHOLD || !validated ? "uncertain" : "solved";
  const answer = tie || ambiguous ? null : best.i;

  const bestAttr = selectBestPerAttribute(attributeRules);
  const transform = decision.kept.find((c) => c.transform && c.transform.predicted && c.explained.informative);
  const profile: Record<string, AttrValue | null> = {};
  for (const r of bestAttr) profile[r.attr.name] = r.predicted;
  const row = Math.floor(missing / problem.cols);
  const col = missing % problem.cols;
  const template = problem.cells[row * problem.cols + (col > 0 ? col - 1 : col + 1)] ?? null;
  const predicted = transform?.transform?.predicted ?? synthesizeCell(profile, template);
  // One explanation line per attribute (the first kept rule for it).
  const seenAttr = new Set<string>();
  const rules = decision.kept
    .map((c) => c.explained)
    .filter((r) => {
      const k = `${r.attribute}/${r.informative}`;
      if (seenAttr.has(k) || (!r.informative && seenAttr.has(`${r.attribute}/true`))) return false;
      seenAttr.add(k);
      return true;
    });
  const rejectedNotes = ambiguous
    ? ["Ambiguous: another validated rule fits the complete rows/columns but points to a different option."]
    : [];
  rejectedNotes.push(...decision.rejected
    .filter((c) => c.explained.informative)
    .map((c) => `Rejected alternative: ${c.explained.text} (contradicts a more complete or simpler rule)`));

  // Distinct attributes with a changing rule (a whole-cell transformation that
  // restates an attribute rule does not make it a two-rule question).
  const attrRules = keptInf.filter((c) => c.explained.attribute !== "cell").map((c) => c.explained.attribute);
  const changingAttrs = new Set(attrRules.filter((a) => !attrRules.some((b) => b !== a && coveredBy(b).includes(a))));
  const primary = pickStrategyName(active, best.i, changingAttrs.size);
  const solution: Solution = {
    status,
    answer,
    answerLabel: answer === null ? null : OPTION_LABELS[answer],
    confidence,
    rawConfidence: raw,
    strategy: primary,
    validated,
    candidates: ambiguous ? [...new Set([...candidates, ...altOptions])] : candidates,
    optionScores: combined,
    strategies,
    rules,
    predicted,
    confidenceFactors: factors,
    explanation: { questionType: "", rules: [], validation: [], missingCell: [], answer: "", confidence: "", notes: rejectedNotes },
    durationMs: now() - t0,
  };
  solution.explanation = buildExplanation(problem, solution);
  return solution;
}

function pickStrategyName(active: StrategyResult[], best: number, informativeRules: number): string {
  // Most specific (non-combination) strategy that supports the answer.
  const specific = active
    .filter((s) => s.id !== "two_rule_combination" && s.topOptions.includes(best))
    .sort((a, b) => b.weight - a.weight || a.complexity - b.complexity);
  if (informativeRules >= 2) return "two_rule_combination";
  const s = specific[0] ?? active[0];
  const axis = s.rules[0]?.axis;
  const prefix = axis === "row" ? "horizontal_" : axis === "col" ? "vertical_" : axis === "diag" ? "diagonal_" : "";
  return s.id.endsWith("_transformation") ? s.id : `${prefix}${s.id}`;
}

function emptySolution(problem: MatrixProblem, reason: string, t0: number, strategies: StrategyResult[] = []): Solution {
  const s: Solution = {
    status: "unsolved",
    answer: null,
    answerLabel: null,
    confidence: 0,
    rawConfidence: 0,
    strategy: null,
    validated: false,
    candidates: [],
    optionScores: problem.options.map(() => 0),
    strategies,
    rules: [],
    predicted: null,
    confidenceFactors: {},
    explanation: { questionType: "", rules: [], validation: [], missingCell: [], answer: "", confidence: "", notes: [reason] },
    durationMs: now() - t0,
  };
  s.explanation = buildExplanation(problem, s);
  return s;
}
