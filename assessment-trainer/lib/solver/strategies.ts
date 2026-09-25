import type { MatrixProblem } from "../matrigma/types";
import type { CellFeatures } from "./features";
import { describePrediction, describeRule, fitAttributeRules, selectBestPerAttribute, type FittedRule } from "./rules";
import { describeTransformRule, fitAlternation, fitTransformRules, type TransformRule } from "./transform-rules";
import type { Axis } from "./lines";
import type { ExplainedRule, StrategyId, StrategyResult } from "./types";
import { fitRolling } from "./rolling";

export interface StrategyContext {
  problem: MatrixProblem;
  missing: number;
  features: (CellFeatures | null)[];
  optionFeatures: CellFeatures[];
  /** All validated attribute rules (computed once, shared by strategies). */
  attributeRules: FittedRule[];
}

type StrategyFn = (ctx: StrategyContext) => Omit<StrategyResult, "id" | "label" | "durationMs" | "informative" | "topOptions" | "weight">;

function explainAttr(r: FittedRule): ExplainedRule {
  return {
    text: describeRule(r),
    attribute: r.attr.name,
    kind: r.kind,
    axis: r.axis,
    complexity: r.complexity,
    validation: r.validated,
    prediction: describePrediction(r),
    informative: r.kind !== "constant",
  };
}

function explainTransform(r: TransformRule, attribute = "cell"): ExplainedRule {
  const identityOnly = r.steps.every((s) => s.transform.family === "identity");
  return {
    text: r.steps.length ? describeTransformRule(r) : `In each ${r.axis === "sequence" ? "sequence" : "row"} the figures alternate A → B → A.`,
    attribute,
    kind: r.steps.length ? r.steps.map((s) => s.transform.id).join("+") : "alternation",
    axis: r.axis,
    complexity: r.complexity,
    validation: r.validated,
    informative: !identityOnly,
  };
}

function fromAttributeRules(ctx: StrategyContext, filter: (r: FittedRule) => boolean) {
  const rules = selectBestPerAttribute(ctx.attributeRules.filter(filter));
  const n = ctx.problem.options.length;
  if (!rules.length) {
    return { applicable: false, rules: [], optionScores: new Array(n).fill(0), complexity: 0, validatedLines: 0 };
  }
  let wsum = 0;
  const scores = new Array(n).fill(0);
  for (const r of rules) {
    wsum += r.attr.weight;
    r.optionScores.forEach((s, i) => (scores[i] += s * r.attr.weight));
  }
  return {
    applicable: true,
    rules: rules.map(explainAttr),
    optionScores: scores.map((s) => s / wsum),
    complexity: rules.reduce((s, r) => s + r.complexity, 0),
    validatedLines: Math.min(...rules.map((r) => r.validated.length)),
  };
}

function fromTransform(ctx: StrategyContext, axes: Axis[], allowed?: Parameters<typeof fitTransformRules>[3], requireFamily?: string) {
  const n = ctx.problem.options.length;
  let best: TransformRule | null = null;
  for (const axis of axes) {
    const r = fitTransformRules(ctx.problem, ctx.missing, axis, allowed);
    if (!r) continue;
    if (requireFamily && !r.families.has(requireFamily)) continue;
    if (!best || r.complexity < best.complexity) best = r;
  }
  if (!best) return { applicable: false, rules: [], optionScores: new Array(n).fill(0), complexity: 0, validatedLines: 0 };
  return {
    applicable: true,
    rules: [explainTransform(best)],
    optionScores: best.optionScores,
    complexity: best.complexity,
    validatedLines: best.validated.length,
    predicted: best.predicted,
  };
}

const mainAxes = (p: MatrixProblem): Axis[] => (p.rows === 1 ? ["sequence"] : ["row", "col"]);
const nonConstant = (r: FittedRule) => r.kind !== "constant";

function merge(...parts: ReturnType<StrategyFn>[]): ReturnType<StrategyFn> {
  const ok = parts.filter((p) => p.applicable);
  if (!ok.length) return parts[0];
  const n = ok[0].optionScores.length;
  return {
    applicable: true,
    rules: ok.flatMap((p) => p.rules),
    optionScores: Array.from({ length: n }, (_, i) => ok.reduce((s, p) => s + p.optionScores[i], 0) / ok.length),
    complexity: Math.min(...ok.map((p) => p.complexity)),
    validatedLines: Math.max(...ok.map((p) => p.validatedLines)),
    predicted: ok.find((p) => p.predicted)?.predicted ?? null,
  };
}

export const STRATEGIES: { id: StrategyId; label: string; run: StrategyFn }[] = [
  {
    id: "horizontal_transformation",
    label: "Horizontal transformation",
    run: (c) => fromTransform(c, c.problem.rows === 1 ? ["sequence"] : ["row"]),
  },
  { id: "vertical_transformation", label: "Vertical transformation", run: (c) => fromTransform(c, ["col"]) },
  { id: "diagonal_transformation", label: "Diagonal transformation", run: (c) => fromTransform(c, ["diag"]) },
  {
    id: "rotation",
    label: "Rotation",
    run: (c) =>
      merge(
        fromAttributeRules(c, (r) => r.attr.name === "rotation" && (r.kind === "progression" || r.kind === "progression_line")),
        fromTransform(c, mainAxes(c.problem), (t) => t.family === "rotation" || t.family === "identity", "rotation"),
      ),
  },
  {
    id: "reflection",
    label: "Reflection",
    run: (c) => fromTransform(c, mainAxes(c.problem), (t) => t.family === "reflection" || t.family === "identity", "reflection"),
  },
  {
    id: "translation",
    label: "Translation",
    run: (c) =>
      merge(
        fromAttributeRules(c, (r) => (r.attr.name === "slotCol" || r.attr.name === "slotRow") && nonConstant(r)),
        fromTransform(c, mainAxes(c.problem), (t) => t.family === "translation" || t.family === "identity", "translation"),
      ),
  },
  { id: "object_count", label: "Object count", run: (c) => fromAttributeRules(c, (r) => r.attr.name === "count" && nonConstant(r)) },
  { id: "size_progression", label: "Size progression", run: (c) => fromAttributeRules(c, (r) => r.attr.name === "size" && nonConstant(r)) },
  { id: "fill_progression", label: "Fill progression", run: (c) => fromAttributeRules(c, (r) => r.attr.name === "fill" && nonConstant(r)) },
  {
    id: "orientation_progression",
    label: "Orientation progression",
    run: (c) => fromAttributeRules(c, (r) => r.attr.name === "rotation" && (r.kind === "distribute" || r.kind === "alternation")),
  },
  {
    id: "shape_progression",
    label: "Shape progression",
    run: (c) =>
      fromAttributeRules(
        c,
        (r) => (r.attr.name === "shape" || r.attr.name === "shapes" || r.attr.name === "sides") && nonConstant(r),
      ),
  },
  {
    id: "composition",
    label: "Composition (A + B = C)",
    run: (c) => fromAttributeRules(c, (r) => r.kind === "union" || r.kind === "intersection"),
  },
  { id: "subtraction", label: "Subtraction (A − B = C)", run: (c) => fromAttributeRules(c, (r) => r.kind === "difference" || r.kind === "subtract") },
  { id: "xor", label: "XOR-like transformation", run: (c) => fromAttributeRules(c, (r) => r.kind === "xor") },
  {
    id: "alternating_pattern",
    label: "Alternating pattern",
    run: (c) => {
      const attr = fromAttributeRules(c, (r) => r.kind === "alternation");
      const whole = fitAlternation(c.problem, c.missing);
      const wholePart = whole
        ? { applicable: true, rules: [explainTransform(whole)], optionScores: whole.optionScores, complexity: whole.complexity, validatedLines: whole.validated.length, predicted: whole.predicted }
        : { ...attr, applicable: false };
      return merge(attr, wholePart);
    },
  },
  {
    id: "rolling_block",
    label: "Rolling block",
    run: (c) => {
      const n = c.problem.options.length;
      const rules = fitRolling(c.problem, c.missing);
      if (!rules.length) return { applicable: false, rules: [], optionScores: new Array(n).fill(0), complexity: 0, validatedLines: 0 };
      return {
        applicable: true,
        rules: rules.map((r) => r.explained),
        optionScores: Array.from({ length: n }, (_, i) => Math.max(...rules.map((r) => r.optionScores[i]))),
        complexity: Math.min(...rules.map((r) => r.explained.complexity)),
        validatedLines: Math.min(...rules.map((r) => r.validated.length)),
        predicted: null,
      };
    },
  },
  {
    id: "two_rule_combination",
    label: "Rule combination (all attributes)",
    run: (c) => fromAttributeRules(c, () => true),
  },
];
