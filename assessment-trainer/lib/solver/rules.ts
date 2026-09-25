import type { MatrixProblem } from "../matrigma/types";
import type { CellFeatures } from "./features";
import { ATTRIBUTES, RULE_COMPLEXITY, type AttrSpec, type AttrValue, type RuleKind } from "./attributes";
import { AXIS_WORD, buildLines, type Axis, type Line } from "./lines";

/**
 * Attribute rule engine.
 *
 * For every attribute, axis and rule kind we
 *   1. generate a hypothesis (fit parameters on the first complete line),
 *   2. apply it to every complete line,
 *   3. compute the error per line,
 *   4. accept only if it holds on ALL complete lines (independent validation),
 *   5. record its complexity,
 * and later score each answer option by inserting it into the incomplete line.
 */

const BIG = 99;
const LAYER_ATTR_NAMES = new Set(["lines", "bars", "dots"]);

export interface FittedRule {
  attr: AttrSpec;
  axis: Axis;
  kind: RuleKind;
  param: AttrValue | AttrValue[] | null;
  complexity: number;
  validated: { label: string; ok: boolean }[];
  targetLines: Line[];
  /** Predicted value for the missing cell, when determinable. */
  predicted: AttrValue | null;
  /** Score in [0,1] per answer option. */
  optionScores: number[];
}

interface Ctx {
  period: number; // for angles
}

function numDiff(a: number, b: number, spec: AttrSpec, ctx: Ctx): number {
  if (spec.kind === "angle" && ctx.period) {
    let d = (((b - a) % ctx.period) + ctx.period) % ctx.period;
    if (d > ctx.period / 2) d -= ctx.period;
    return d;
  }
  return b - a;
}

function eqVal(a: AttrValue, b: AttrValue, spec: AttrSpec, ctx: Ctx): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(numDiff(a, b, spec, ctx)) <= spec.tol;
  }
  return a === b;
}

function toSet(v: AttrValue): Set<string> {
  return new Set(String(v).split(/[;,]/).filter(Boolean));
}

function setKey(s: Set<string>, sep: string): string {
  const arr = [...s];
  const numeric = arr.every((x) => /^\d+$/.test(x));
  return (numeric ? arr.map(Number).sort((a, b) => a - b).map(String) : arr.sort()).join(sep);
}

function applySetOp(kind: RuleKind, a: AttrValue, b: AttrValue, spec: AttrSpec): string {
  const A = toSet(a);
  const B = toSet(b);
  let out: Set<string>;
  if (kind === "union") out = new Set([...A, ...B]);
  else if (kind === "difference") out = new Set([...A].filter((x) => !B.has(x)));
  else if (kind === "intersection") out = new Set([...A].filter((x) => B.has(x)));
  else out = new Set([...[...A].filter((x) => !B.has(x)), ...[...B].filter((x) => !A.has(x))]);
  return setKey(out, spec.name === "positions" ? "," : ";");
}

/** Error of a line (in tolerance units, <=1 means the rule holds). */
function lineError(kind: RuleKind, vals: AttrValue[], spec: AttrSpec, ctx: Ctx, param: unknown): number {
  const n = vals.length;
  switch (kind) {
    case "constant": {
      if (spec.kind === "numeric" || spec.kind === "angle") {
        let e = 0;
        for (let i = 1; i < n; i++) {
          e = Math.max(e, Math.abs(numDiff(vals[0] as number, vals[i] as number, spec, ctx)) / (spec.tol || 1));
        }
        return e;
      }
      return vals.every((v) => v === vals[0]) ? 0 : BIG;
    }
    case "progression":
    case "progression_line": {
      if (typeof vals[0] !== "number") return BIG;
      const d0 = kind === "progression" ? (param as number) : numDiff(vals[0] as number, vals[1] as number, spec, ctx);
      if (Math.abs(d0) <= spec.tol) return BIG; // that is "constant", not a progression
      let e = 0;
      for (let i = 1; i < n; i++) {
        const d = numDiff(vals[i - 1] as number, vals[i] as number, spec, ctx);
        e = Math.max(e, Math.abs(numDiff(d0, d, { ...spec, kind: "angle" }, ctx)) / (spec.tol || 1));
      }
      return e;
    }
    case "distribute": {
      const set = param as AttrValue[];
      if (set.length !== n) return BIG;
      const used = new Array(n).fill(false);
      for (const v of vals) {
        const j = set.findIndex((s, k) => !used[k] && eqVal(s, v, spec, ctx));
        if (j < 0) return BIG;
        used[j] = true;
      }
      return 0;
    }
    case "alternation": {
      if (n < 3) return BIG;
      if (eqVal(vals[0], vals[1], spec, ctx)) return BIG;
      for (let i = 2; i < n; i++) if (!eqVal(vals[i], vals[i - 2], spec, ctx)) return BIG;
      return 0;
    }
    case "add":
    case "subtract": {
      if (n !== 3 || typeof vals[0] !== "number") return BIG;
      const [a, b, c] = vals as number[];
      const expect = kind === "add" ? a + b : a - b;
      if (kind === "subtract" && expect <= 0) return BIG;
      return Math.abs(expect - c) / (spec.tol || 1);
    }
    case "union":
    case "difference":
    case "xor":
    case "intersection": {
      if (n !== 3) return BIG;
      const res = applySetOp(kind, vals[0], vals[1], spec);
      // Degenerate cases (e.g. union where B ⊆ A) are allowed but the result must be non-empty,
      // except for texture layers where a row without bars or dots is normal (empty + empty = empty).
      if (!res) return LAYER_ATTR_NAMES.has(spec.name) && String(vals[2]) === "" ? 0 : BIG;
      return res === String(vals[2]) ? 0 : BIG;
    }
  }
}

function fitParam(kind: RuleKind, vals: AttrValue[], spec: AttrSpec, ctx: Ctx): unknown {
  if (kind === "progression") return numDiff(vals[0] as number, vals[1] as number, spec, ctx);
  if (kind === "distribute") {
    // Values must be pairwise distinct.
    for (let i = 0; i < vals.length; i++)
      for (let j = i + 1; j < vals.length; j++) if (eqVal(vals[i], vals[j], spec, ctx)) return null;
    return [...vals];
  }
  return true;
}

function predictValue(kind: RuleKind, vals: (AttrValue | null)[], k: number, spec: AttrSpec, ctx: Ctx, param: unknown): AttrValue | null {
  const n = vals.length;
  const known = vals.map((v, i) => ({ v, i })).filter((x) => x.i !== k && x.v !== null) as { v: AttrValue; i: number }[];
  const wrap = (x: number) => (spec.kind === "angle" && ctx.period ? ((x % ctx.period) + ctx.period) % ctx.period : x);
  switch (kind) {
    case "constant":
      return known[0]?.v ?? null;
    case "progression":
    case "progression_line": {
      let d: number;
      if (kind === "progression") d = param as number;
      else {
        const pairs = known.filter((x) => known.some((y) => y.i === x.i + 1));
        if (!pairs.length) return null;
        const a = pairs[0];
        d = numDiff(a.v as number, known.find((y) => y.i === a.i + 1)!.v as number, spec, ctx);
      }
      const ref = known[0];
      return wrap((ref.v as number) + d * (k - ref.i));
    }
    case "distribute": {
      const set = [...(param as AttrValue[])];
      for (const x of known) {
        const j = set.findIndex((s) => eqVal(s, x.v, spec, ctx));
        if (j >= 0) set.splice(j, 1);
      }
      return set.length === 1 ? set[0] : null;
    }
    case "alternation": {
      const partner = known.find((x) => Math.abs(x.i - k) % 2 === 0);
      return partner ? partner.v : null;
    }
    case "add":
    case "subtract":
      if (k !== 2 || n !== 3) return null;
      return kind === "add" ? (vals[0] as number) + (vals[1] as number) : (vals[0] as number) - (vals[1] as number);
    default:
      if (k !== 2 || n !== 3 || vals[0] === null || vals[1] === null) return null;
      return applySetOp(kind, vals[0], vals[1], spec);
  }
}

function lineCtx(feats: (CellFeatures | null)[], spec: AttrSpec): Ctx | null {
  if (spec.kind !== "angle") return { period: 0 };
  if (spec.period) return { period: spec.period };
  const periods = new Set(feats.filter(Boolean).map((f) => f!.rotationPeriod));
  if (periods.size !== 1) return null;
  const p = [...periods][0];
  return p ? { period: p } : null;
}

function optionScoreFromError(e: number): number {
  if (e <= 1) return 1 - 0.15 * e;
  return Math.max(0, 0.7 - 0.35 * (e - 1));
}

export interface RuleContext {
  problem: MatrixProblem;
  features: (CellFeatures | null)[];
  optionFeatures: CellFeatures[];
  missing: number;
}

const AXIS_PENALTY: Record<Axis, number> = { row: 0, sequence: 0, col: 0.1, diag: 0.4 };

/** Fit every (attribute, axis, rule kind) hypothesis and keep the validated ones. */
export function fitAttributeRules(rc: RuleContext, attrs = ATTRIBUTES): FittedRule[] {
  const out: FittedRule[] = [];
  const axes: Axis[] = rc.problem.rows === 1 ? ["sequence"] : ["row", "col", "diag"];
  for (const spec of attrs) {
    for (const axis of axes) {
      const lines = buildLines(rc.problem, axis);
      const known = lines.filter((l) => !l.cells.includes(rc.missing));
      const targets = lines.filter((l) => l.cells.includes(rc.missing));
      if (!known.length || !targets.length) continue;
      const knownVals = known.map((l) => l.cells.map((i) => (rc.features[i] ? spec.get(rc.features[i]!) : null)));
      if (knownVals.some((vs) => vs.some((v) => v === null))) continue;
      const knownCtx = known.map((l) => lineCtx(l.cells.map((i) => rc.features[i]), spec));
      if (knownCtx.some((c) => c === null)) continue;

      for (const kind of spec.kinds) {
        const lineLen = known[0].cells.length;
        if ((kind === "alternation" && lineLen < 3) || (["add", "subtract", "union", "difference", "xor", "intersection"].includes(kind) && lineLen !== 3)) continue;
        // Set operations and distribute rules only on rows/columns (not diagonals / windows).
        if ((axis === "diag" || axis === "sequence") && kind !== "constant" && kind !== "progression" && kind !== "alternation") continue;
        const param = fitParam(kind, knownVals[0] as AttrValue[], spec, knownCtx[0]!);
        if (param === null) continue;
        const validated = known.map((l, li) => {
          const e = lineError(kind, knownVals[li] as AttrValue[], spec, knownCtx[li]!, param);
          return { label: l.label, ok: e <= 1 };
        });
        if (!validated.every((v) => v.ok)) continue;
        // Non-trivial set rules need at least two independent confirmations.
        const complexity = RULE_COMPLEXITY[kind] + AXIS_PENALTY[axis];
        if (complexity >= 2.5 && validated.length < 2) continue;
        // Guard against degenerate set rules where the result equals an input on every line.
        if (["union", "difference", "xor", "intersection"].includes(kind)) {
          const trivial = knownVals.every((vs) => vs[2] === vs[0] || vs[2] === vs[1]);
          if (trivial) continue;
        }

        // Score options on every target line.
        let predicted: AttrValue | null = null;
        const scores = rc.optionFeatures.map(() => 0);
        let usable = true;
        for (const t of targets) {
          const k = t.cells.indexOf(rc.missing);
          const baseFeats = t.cells.map((i) => rc.features[i]);
          const baseVals = baseFeats.map((f) => (f ? spec.get(f) : null));
          if (baseVals.some((v, i) => i !== k && v === null)) {
            usable = false;
            break;
          }
          const ctx = lineCtx(baseFeats.filter((_, i) => i !== k), spec);
          if (!ctx) {
            usable = false;
            break;
          }
          if (predicted === null) predicted = predictValue(kind, baseVals, k, spec, ctx, param);
          rc.optionFeatures.forEach((of, oi) => {
            const v = spec.get(of);
            if (v === null) return; // score stays 0
            if (spec.kind === "angle" && !spec.period && of.rotationPeriod !== ctx.period) return;
            const vals = baseVals.map((x, i) => (i === k ? v : x)) as AttrValue[];
            scores[oi] += optionScoreFromError(lineError(kind, vals, spec, ctx, param)) / targets.length;
          });
        }
        if (!usable) continue;
        out.push({
          attr: spec,
          axis,
          kind,
          param: param as AttrValue | AttrValue[] | null,
          complexity,
          validated,
          targetLines: targets,
          predicted,
          optionScores: scores,
        });
      }
    }
  }
  return out;
}

/** For each attribute choose the simplest validated rule (ties: row before column before diagonal). */
export function selectBestPerAttribute(rules: FittedRule[]): FittedRule[] {
  const byAttr = new Map<string, FittedRule[]>();
  for (const r of rules) {
    const list = byAttr.get(r.attr.name) ?? [];
    list.push(r);
    byAttr.set(r.attr.name, list);
  }
  const best: FittedRule[] = [];
  for (const list of byAttr.values()) {
    list.sort((a, b) => a.complexity - b.complexity || b.validated.length - a.validated.length);
    best.push(list[0]);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Human readable descriptions

const SHAPE_WORD = (v: AttrValue) => String(v);

const LAYER_WORDS: Record<string, Record<string, string>> = {
  lines: { v: "vertical lines", h: "horizontal lines", d: "diagonal lines (/)", a: "diagonal lines (\\)", "arc-up": "arcs curving up", "arc-down": "arcs curving down" },
  bars: { v: "vertical bar", h: "horizontal bar", d: "diagonal bar (/)", a: "diagonal bar (\\)" },
  dots: { tl: "top-left", tr: "top-right", bl: "bottom-left", br: "bottom-right", c: "centre" },
};

export function describeLayer(name: "lines" | "bars" | "dots", v: string): string {
  const tokens = v.split(";").filter(Boolean);
  if (!tokens.length) return "none";
  const words = tokens.map((t) => LAYER_WORDS[name][t] ?? t);
  return name === "dots" ? `dots at ${words.join(", ")}` : words.join(" + ");
}

function fmtVal(spec: AttrSpec, v: AttrValue | null): string {
  if (v === null) return "?";
  if (spec.name === "fill") return v === 0 ? "empty" : v === 1 ? "solid" : "half-filled";
  if (spec.name === "size") return `${Math.round((v as number) * 100)}%`;
  if (spec.name === "rotation") return `${Math.round(v as number)}°`;
  if (spec.name === "positions") return `slots {${v}}`;
  if (spec.name === "slotCol") return ["left", "middle", "right"][Number(v)] ?? String(v);
  if (spec.name === "slotRow") return ["top", "middle", "bottom"][Number(v)] ?? String(v);
  if (spec.name === "objects") return `${String(v).split(";").filter(Boolean).length} elements`;
  if (spec.name === "shape") return SHAPE_WORD(v);
  if (spec.name === "lines" || spec.name === "bars" || spec.name === "dots") return describeLayer(spec.name, String(v));
  return String(v);
}

export function describeRule(r: FittedRule): string {
  const where = r.axis === "sequence" ? "Along the sequence" : `In each ${AXIS_WORD[r.axis]}`;
  const L = r.attr.label;
  switch (r.kind) {
    case "constant":
      return `${where} the ${L} stays the same.`;
    case "progression": {
      const d = r.param as number;
      if (r.attr.name === "rotation") return `${where} the figure rotates ${Math.abs(Math.round(d))}° ${d > 0 ? "clockwise" : "counter-clockwise"} per step.`;
      if (r.attr.name === "fill") return `${where} the fill ${d > 0 ? "increases" : "decreases"} one step at a time (empty → half → solid).`;
      if (r.attr.name === "size") return `${where} the size ${d > 0 ? "grows" : "shrinks"} by the same amount each step.`;
      if (r.attr.name === "slotCol") return `${where} the figure moves one step ${d > 0 ? "right" : "left"} (wrapping around the edge).`;
      if (r.attr.name === "slotRow") return `${where} the figure moves one step ${d > 0 ? "down" : "up"} (wrapping around the edge).`;
      return `${where} the ${L} ${d > 0 ? "increases" : "decreases"} by ${Math.abs(Math.round(d * 100) / 100)} per step.`;
    }
    case "progression_line":
      return `${where} the ${L} changes by a constant step (the step differs between ${AXIS_WORD[r.axis]}s).`;
    case "distribute":
      return `Each ${AXIS_WORD[r.axis]} contains the same three values of ${L} (${(r.param as AttrValue[]).map((v) => fmtVal(r.attr, v)).join(", ")}), each exactly once.`;
    case "alternation":
      return `${where} the ${L} alternates (A → B → A).`;
    case "add":
      return `${where} the ${L} in the last cell equals the sum of the first two.`;
    case "subtract":
      return `${where} the ${L} in the last cell equals the first minus the second.`;
    case "union":
      return `${where} the last cell is the overlay (union) of the first two cells (${L}).`;
    case "difference":
      return `${where} the last cell is the first cell with the elements of the second removed (${L}).`;
    case "xor":
      return `${where} the last cell keeps only elements that appear in exactly one of the first two cells (XOR on ${L}).`;
    case "intersection":
      return `${where} the last cell keeps only elements common to the first two cells (${L}).`;
  }
}

export function describePrediction(r: FittedRule): string {
  return `${r.targetLines[0]?.label ?? "Target"}: expected ${r.attr.label} = ${fmtVal(r.attr, r.predicted)}`;
}

export { fmtVal };
