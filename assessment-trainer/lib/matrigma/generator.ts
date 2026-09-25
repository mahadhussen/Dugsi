import type {
  Cell,
  Difficulty,
  Fill,
  GeneratedMatrixQuestion,
  MatrigmaCategory,
  MatrixObject,
  MatrixProblem,
  RuleDescriptor,
  Shape,
} from "./types";
import { MATRIGMA_CATEGORIES } from "./types";
import { Rng } from "./rng";
import { SLOT_COORDS } from "./geometry";
import { COUNT_LAYOUT_SLOTS } from "./layouts";
import { cellSimilarity, cellSimilarityStrict } from "../solver/similarity";
import { cellFeatures } from "../solver/features";
import { TRANSFORMS } from "../solver/transforms";
import { solveMatrix } from "../solver/solve";
import { rollPositions, shapeKey, type Pt } from "../solver/rolling";
import { LINE_TOKENS, BAR_TOKENS } from "./types";
import type { CellPattern } from "./types";

/**
 * Synthetic Matrigma-like question generator.
 *
 * Every question is built from explicit rules, so the solution is known by
 * construction. Wrong options are near-misses that each violate at least one
 * rule, and are checked to be visually distinct from the answer and from each
 * other.
 */

export const GENERATOR_VERSION = "1.0.0";
const ROWS = 3;
const COLS = 3;
const N_OPTIONS = 6;

type AttrName = "shape" | "count" | "fill" | "size" | "rotation" | "position" | "sides";
type RuleKind = "const" | "rowconst" | "prog" | "latin" | "alt" | "add";

interface CellSpec {
  shape: Shape;
  count: number;
  fill: Fill;
  size: number;
  rotation: number;
  pos: number;
  /** Explicit slots for multi-object cells (scattered layout). */
  slots?: number[];
}

interface AttrRule {
  attr: AttrName;
  kind: RuleKind;
  value: (r: number, c: number) => number | string;
  describe: string;
}

const PLAIN_SHAPES: Shape[] = ["circle", "square", "triangle", "pentagon", "hexagon", "star", "diamond", "cross"];
const FILLS: Fill[] = [0, 0.5, 1];
const FILL_WORD: Record<number, string> = { 0: "empty", 0.5: "half-filled", 1: "solid" };
const SIDES_SHAPE: Record<number, Shape> = { 3: "triangle", 4: "square", 5: "pentagon", 6: "hexagon" };
const DIR_WORD: Record<number, string> = { 0: "up", 45: "up-right", 90: "right", 135: "down-right", 180: "down", 225: "down-left", 270: "left", 315: "up-left" };

function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}

/**
 * Three arrow directions whose cyclic gaps are all different. With equal gaps
 * (e.g. up/right/down) a Latin square of directions can also be read as
 * "rotate by a fixed step", which would make the puzzle ambiguous.
 */
function distinctGapDirections(rng: Rng): number[] {
  for (;;) {
    const v = rng.sample([0, 45, 90, 135, 180, 225, 270, 315], 3).sort((a, b) => a - b);
    const gaps = [v[1] - v[0], v[2] - v[1], 360 - v[2] + v[0]];
    if (new Set(gaps).size === 3) return rng.shuffle(v);
  }
}

function latin<T>(rng: Rng, values: T[]): (r: number, c: number) => T {
  const shift = rng.pick([1, 2]);
  const perm = rng.shuffle(values);
  return (r, c) => perm[mod(c + r * shift, 3)];
}

function buildCell(s: CellSpec, decoration: MatrixObject | null): Cell {
  const objects: MatrixObject[] = [];
  if (s.count <= 1) {
    const [x, y] = SLOT_COORDS[s.pos];
    objects.push({ shape: s.shape, fill: s.fill, size: s.size, rotation: s.rotation, x, y });
  } else {
    for (const slot of s.slots && s.slots.length === s.count ? s.slots : COUNT_LAYOUT_SLOTS[s.count]) {
      const [x, y] = SLOT_COORDS[slot];
      objects.push({ shape: s.shape, fill: s.fill, size: s.size, rotation: s.rotation, x, y });
    }
  }
  if (decoration) objects.push(decoration);
  return { objects };
}

interface Plan {
  rules: AttrRule[];
  decoration: MatrixObject | null;
  base: CellSpec;
  /** Scatter multi-object cells over random slots (avoids accidental set relations). */
  scatter: boolean;
}

/** Choose the rule for one attribute. */
function ruleFor(attr: AttrName, rng: Rng, base: CellSpec, variant: "main" | "extra" | "rowconst"): AttrRule {
  if (variant === "rowconst") {
    switch (attr) {
      case "shape": {
        const vals = rng.sample(PLAIN_SHAPES.filter((s) => s !== base.shape), 3);
        return { attr, kind: "rowconst", value: (r) => vals[r], describe: "Each row uses its own shape." };
      }
      case "fill": {
        const vals = rng.shuffle(FILLS);
        return { attr, kind: "rowconst", value: (r) => vals[r], describe: "Each row uses its own fill." };
      }
      default:
        throw new Error(`rowconst not supported for ${attr}`);
    }
  }
  switch (attr) {
    case "rotation": {
      const step = base.shape === "arrow" ? rng.pick([45, 90, -90, -45]) : rng.pick([90, -90]);
      const starts = rng.shuffle(base.shape === "arrow" ? [0, 90, 180, 270, 45, 135] : [0, 90, 180]).slice(0, 3);
      if (variant === "extra" || rng.bool(0.8)) {
        return {
          attr,
          kind: "prog",
          value: (r, c) => mod(starts[r] + step * c, 360),
          describe: `In each row the figure rotates ${Math.abs(step)}° ${step > 0 ? "clockwise" : "counter-clockwise"} per step.`,
        };
      }
      if (base.shape !== "arrow") {
        // Triangle orientations repeat every 120°, so a Latin square of them is
        // indistinguishable from a rotation step; use a progression instead.
        return { attr, kind: "prog", value: (r, c) => mod(starts[r] + step * c, 360), describe: `In each row the figure rotates ${Math.abs(step)}° ${step > 0 ? "clockwise" : "counter-clockwise"} per step.` };
      }
      const vals = distinctGapDirections(rng);
      return { attr, kind: "latin", value: latin(rng, vals), describe: `Each row contains the orientations ${vals.map((v) => DIR_WORD[v] ?? `${v}°`).join(", ")} once each.` };
    }
    case "count": {
      const k = rng.int(0, 2);
      if (k === 0) {
        const d = rng.pick([1, -1]);
        const starts = d > 0 ? rng.shuffle([1, 2, 3]) : rng.shuffle([3, 4, 5]);
        return { attr, kind: "prog", value: (r, c) => starts[r] + d * c, describe: `In each row the number of objects ${d > 0 ? "increases" : "decreases"} by one.` };
      }
      if (k === 1) {
        const vals = rng.sample([1, 2, 3, 4, 5], 3);
        return { attr, kind: "latin", value: latin(rng, vals), describe: `Each row contains ${vals.sort().join(", ")} objects, once each.` };
      }
      const pairs = rng.shuffle([[1, 1], [1, 2], [2, 1], [2, 2], [1, 3], [3, 1], [2, 3], [3, 2]]).slice(0, 3);
      return { attr, kind: "add", value: (r, c) => (c < 2 ? pairs[r][c] : pairs[r][0] + pairs[r][1]), describe: "In each row the third cell has as many objects as the first two together." };
    }
    case "fill": {
      if (rng.bool(0.5)) {
        const asc = rng.bool();
        const seq = asc ? FILLS : [...FILLS].reverse();
        return { attr, kind: "prog", value: (_r, c) => seq[c], describe: `In each row the fill goes ${seq.map((f) => FILL_WORD[f]).join(" → ")}.` };
      }
      return { attr, kind: "latin", value: latin(rng, FILLS), describe: "Each row contains an empty, a half-filled and a solid figure." };
    }
    case "size": {
      const sizes = [0.45, 0.65, 0.85];
      if (rng.bool(0.6)) {
        const seq = rng.bool() ? sizes : [...sizes].reverse();
        return { attr, kind: "prog", value: (_r, c) => seq[c], describe: `In each row the figure ${seq[0] < seq[2] ? "grows" : "shrinks"} step by step.` };
      }
      return { attr, kind: "latin", value: latin(rng, sizes), describe: "Each row contains a small, a medium and a large figure." };
    }
    case "position": {
      const y = rng.int(0, 2);
      if (rng.bool(0.6)) {
        const dx = rng.pick([1, -1]);
        const x0 = rng.shuffle([0, 1, 2]);
        return {
          attr,
          kind: "prog",
          value: (r, c) => mod(y + r, 3) * 3 + mod(x0[r] + dx * c, 3),
          describe: `In each row the figure moves one step ${dx > 0 ? "right" : "left"} (wrapping around).`,
        };
      }
      const cols = latin(rng, [0, 1, 2]);
      return { attr, kind: "latin", value: (r, c) => mod(y + r, 3) * 3 + cols(r, c), describe: "In each row the figure visits the left, middle and right position once each." };
    }
    case "shape": {
      if (variant === "main" && rng.bool(0.3)) {
        // Alternate start values so the two complete rows differ; otherwise
        // "each row contains the same three shapes" would fit equally well.
        const s0 = rng.pick([3, 4]);
        const starts = [s0, 7 - s0, s0];
        return { attr: "sides", kind: "prog", value: (r, c) => SIDES_SHAPE[starts[r] + c], describe: "In each row the number of corners increases by one (triangle → square → pentagon…)." };
      }
      if (rng.bool(0.25)) {
        const pairs = Array.from({ length: 3 }, () => rng.sample(PLAIN_SHAPES, 2));
        return { attr, kind: "alt", value: (r, c) => pairs[r][c % 2], describe: "In each row the shapes alternate A → B → A." };
      }
      const vals = rng.sample(PLAIN_SHAPES, 3);
      return { attr, kind: "latin", value: latin(rng, vals), describe: `Each row contains a ${vals.join(", a ")} — each exactly once.` };
    }
    default:
      throw new Error(`no rule for ${attr}`);
  }
}

const MAIN_ATTR: Partial<Record<MatrigmaCategory, AttrName>> = {
  rotation: "rotation",
  direction: "rotation",
  count: "count",
  position: "position",
  shape: "shape",
  fill: "fill",
  size: "size",
};

function compatibleExtras(active: AttrName[]): AttrName[] {
  const all: AttrName[] = ["count", "fill", "shape", "rotation", "size", "position"];
  return all.filter((a) => {
    if (active.includes(a)) return false;
    if (a === "sides" || (a === "shape" && active.includes("sides"))) return false;
    if (a === "shape" && active.includes("rotation")) return false;
    if (a === "rotation" && (active.includes("shape") || active.includes("sides"))) return false;
    if ((a === "size" || a === "position") && active.includes("count")) return false;
    if (a === "count" && (active.includes("size") || active.includes("position"))) return false;
    if (a === "size" && active.includes("position")) return false;
    if (a === "position" && active.includes("size")) return false;
    return true;
  });
}

function planAttributes(category: MatrigmaCategory, difficulty: Difficulty, rng: Rng): Plan {
  const active: AttrName[] = [];
  if (category === "multi-rule") {
    const n = difficulty === "expert" ? 3 : 2;
    while (active.length < n) {
      const opts = compatibleExtras(active);
      active.push(rng.pick(opts));
    }
  } else {
    active.push(MAIN_ATTR[category]!);
    const extras = difficulty === "hard" ? 1 : difficulty === "expert" ? 2 : 0;
    for (let i = 0; i < extras; i++) {
      const opts = compatibleExtras(active);
      if (opts.length) active.push(rng.pick(opts));
    }
  }
  const rotating = active.includes("rotation");
  const base: CellSpec = {
    shape: rotating ? (category === "direction" ? "arrow" : rng.pick(["arrow", "triangle"] as Shape[])) : rng.pick(PLAIN_SHAPES),
    count: 1,
    fill: rng.pick(active.includes("fill") ? FILLS : ([0, 1] as Fill[])),
    size: 0.7,
    rotation: 0,
    pos: 4,
  };
  if (active.includes("count")) base.size = 0.3;
  if (active.includes("position")) base.size = 0.35;
  if (rotating && base.shape === "arrow") base.fill = rng.pick([0, 1] as Fill[]);
  const rules: AttrRule[] = [];
  for (const a of active) {
    rules.push(ruleFor(a, rng, base, a === active[0] ? "main" : "extra"));
  }
  let decoration: MatrixObject | null = null;
  if (difficulty === "medium") {
    // Distracting elements: a second attribute that is constant within each
    // row but differs between rows, and/or a constant decorative element.
    const free = (["shape", "fill"] as AttrName[]).filter(
      (a) => !active.includes(a) && !(a === "shape" && (rotating || active.includes("sides"))) && !rules.some((r) => r.attr === "sides"),
    );
    if (free.length) rules.push(ruleFor(rng.pick(free), rng, base, "rowconst"));
    if (!active.includes("count") && !active.includes("position") && rng.bool(0.6)) {
      const slot = rng.pick([0, 2, 6, 8]);
      const [x, y] = SLOT_COORDS[slot];
      decoration = { shape: "circle", fill: 1, size: 0.12, rotation: 0, x, y };
    }
  }
  const countRule = rules.find((r) => r.attr === "count");
  const scatter = !!countRule && (countRule.kind === "add" || rng.bool(0.5));
  return { rules, decoration, base, scatter };
}

function specAt(plan: Plan, r: number, c: number): CellSpec {
  const s: CellSpec = { ...plan.base };
  for (const rule of plan.rules) {
    const v = rule.value(r, c);
    switch (rule.attr) {
      case "shape":
      case "sides":
        s.shape = v as Shape;
        break;
      case "count":
        s.count = v as number;
        break;
      case "fill":
        s.fill = v as Fill;
        break;
      case "size":
        s.size = v as number;
        break;
      case "rotation":
        s.rotation = v as number;
        break;
      case "position":
        s.pos = v as number;
        break;
    }
  }
  return s;
}

/** Near-miss wrong answers: perturb one attribute of the correct spec. */
function specDistractors(plan: Plan, correct: CellSpec, rng: Rng): CellSpec[] {
  const out: CellSpec[] = [];
  const ruleAttrs = plan.rules.map((r) => (r.attr === "sides" ? "shape" : r.attr));
  const rotating = plan.rules.some((r) => r.attr === "rotation");
  const tweak = (attr: AttrName): CellSpec | null => {
    const s = { ...correct };
    switch (attr) {
      case "shape": {
        const pool = rotating ? (["arrow", "triangle"] as Shape[]).filter((x) => x !== s.shape) : PLAIN_SHAPES.filter((x) => x !== s.shape);
        s.shape = rng.pick(pool);
        if (s.shape === "arrow" || s.shape === "triangle") s.rotation = correct.rotation;
        return s;
      }
      case "count": {
        const next = s.count + rng.pick([1, -1, 2]);
        if (next < 1 || next > 5) return null;
        s.count = next;
        if (next > 1) {
          s.size = Math.min(s.size, 0.3);
          s.pos = 4;
        }
        return s;
      }
      case "fill":
        s.fill = rng.pick(FILLS.filter((f) => f !== s.fill));
        return s;
      case "size": {
        const opts = [0.45, 0.65, 0.85].filter((x) => Math.abs(x - s.size) > 0.1);
        if (s.count > 1 || s.pos !== 4) return null;
        s.size = rng.pick(opts);
        return s;
      }
      case "rotation": {
        if (s.shape !== "arrow" && s.shape !== "triangle") return null;
        s.rotation = mod(s.rotation + rng.pick(s.shape === "arrow" ? [90, 180, 270, 45] : [90, 180]), 360);
        return s;
      }
      case "position": {
        if (s.count > 1 || s.size > 0.45) return null; // large figures would not fit off-centre
        s.pos = rng.pick([0, 1, 2, 3, 4, 5, 6, 7, 8].filter((p) => p !== s.pos));
        return s;
      }
      default:
        return null;
    }
  };
  // Prefer perturbing rule attributes (the informative ones), then the rest.
  const order: AttrName[] = [...ruleAttrs, ...ruleAttrs, "shape", "fill", "count", "rotation", "size", "position"] as AttrName[];
  for (let tries = 0; tries < 80 && out.length < 12; tries++) {
    const attr = order[tries % order.length];
    const s = tweak(attr);
    if (s) out.push(s);
  }
  // Two-attribute perturbation for extra variety.
  for (let tries = 0; tries < 10; tries++) {
    const a = tweak(rng.pick(ruleAttrs as AttrName[]));
    if (!a) continue;
    const saved = { ...correct };
    Object.assign(correct, a);
    const b = tweak(rng.pick(["fill", "shape", "count"] as AttrName[]));
    Object.assign(correct, saved);
    if (b) out.push({ ...a, ...Object.fromEntries(Object.entries(b).filter(([k, v]) => (a as unknown as Record<string, unknown>)[k] === (correct as unknown as Record<string, unknown>)[k] && v !== (correct as unknown as Record<string, unknown>)[k])) });
  }
  return out;
}

/** Rule-relevant signature: two cells with equal signatures are indistinguishable by the rules. */
function signature(c: Cell, ignorePositions: boolean): string {
  const f = cellFeatures(c);
  const parts = [f.count, f.shapes, f.fill, f.size === null ? "x" : Math.round(f.size * 20), f.rotation === null ? "x" : Math.round(f.rotation)];
  if (!ignorePositions) parts.push(f.objects);
  if (c.pattern) parts.push(f.lines ?? "", f.bars ?? "", f.dots ?? "");
  if (c.blocks?.length) parts.push(shapeKey(c.blocks));
  if (c.petals?.length) parts.push([...c.petals].map((a) => ((a % 360) + 360) % 360).sort((a, b) => a - b).join(","));
  return parts.join("|");
}

function assembleOptions(correct: Cell, candidates: Cell[], rng: Rng, ignorePositions = false): { options: Cell[]; answer: number } | null {
  const chosen: Cell[] = [];
  const correctSig = signature(correct, ignorePositions);
  for (const c of candidates) {
    if (cellSimilarityStrict(c, correct) >= 0.95) continue;
    if (signature(c, ignorePositions) === correctSig) continue;
    if (chosen.some((x) => cellSimilarityStrict(x, c) >= 0.95)) continue;
    chosen.push(c);
    if (chosen.length === N_OPTIONS - 1) break;
  }
  if (chosen.length < N_OPTIONS - 1) return null;
  const answer = rng.int(0, N_OPTIONS - 1);
  const options = [...chosen];
  options.splice(answer, 0, correct);
  return { options, answer };
}

function finish(
  seed: number,
  category: MatrigmaCategory,
  difficulty: Difficulty,
  grid: Cell[],
  distractors: Cell[],
  rules: RuleDescriptor[],
  rng: Rng,
  ignorePositions = false,
): GeneratedMatrixQuestion | null {
  const missing = ROWS * COLS - 1;
  const correct = grid[missing];
  const assembled = assembleOptions(correct, distractors, rng, ignorePositions);
  if (!assembled) return null;
  const problem: MatrixProblem = {
    rows: ROWS,
    cols: COLS,
    cells: grid.map((c, i) => (i === missing ? null : c)),
    options: assembled.options,
  };
  return {
    id: `${category}-${difficulty}-${seed}`,
    seed,
    category,
    difficulty,
    problem,
    correctAnswer: assembled.answer,
    rules,
    ruleText: rules.map((r) => r.description).join(" "),
  };
}

function scatterSlots(count: number, rng: Rng): number[] {
  return rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8], count);
}

function generateAttributeQuestion(seed: number, category: MatrigmaCategory, difficulty: Difficulty, rng: Rng) {
  const plan = planAttributes(category, difficulty, rng);
  const specs: CellSpec[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const s = specAt(plan, r, c);
      if (plan.scatter && s.count > 1 && s.count <= 9) s.slots = scatterSlots(s.count, rng);
      specs.push(s);
    }
  // Reject degenerate layouts (e.g. count > layout size).
  if (specs.some((s) => s.count < 1 || s.count > 9)) return null;
  const grid = specs.map((s) => buildCell(s, plan.decoration));
  const correctSpec = specs[specs.length - 1];
  const distractors = specDistractors(plan, correctSpec, rng).map((s) => {
    if (plan.scatter && s.count !== correctSpec.count && s.count > 1) s.slots = scatterSlots(s.count, rng);
    return buildCell(s, plan.decoration);
  });
  // Also offer the "previous cell" and "row above" as tempting wrong answers.
  distractors.splice(1, 0, grid[7], grid[5]);
  const rules: RuleDescriptor[] = plan.rules
    .filter((r) => r.kind !== "rowconst")
    .map((r) => ({ attribute: r.attr, kind: r.kind, axis: "row", description: r.describe }));
  return finish(seed, category, difficulty, grid, distractors, rules, rng, plan.scatter);
}

// ---------------------------------------------------------------------------
// Reflection: [A, mirror_h(A), mirror_v(mirror_h(A))]

function randomAsymmetricCell(rng: Rng): Cell {
  const slots = rng.sample([0, 1, 2, 3, 5, 6, 7, 8], 2);
  const arrow: MatrixObject = {
    shape: "arrow",
    fill: rng.pick([0, 1] as Fill[]),
    size: 0.4,
    rotation: rng.pick([45, 135, 225, 315, 90, 270]),
    x: SLOT_COORDS[slots[0]][0],
    y: SLOT_COORDS[slots[0]][1],
  };
  const other: MatrixObject = {
    shape: rng.pick(["circle", "square", "triangle"] as Shape[]),
    fill: rng.pick([0, 1] as Fill[]),
    size: 0.3,
    rotation: 0,
    x: SLOT_COORDS[slots[1]][0],
    y: SLOT_COORDS[slots[1]][1],
  };
  return { objects: [arrow, other] };
}

function generateReflection(seed: number, difficulty: Difficulty, rng: Rng) {
  const T = (id: string) => TRANSFORMS.find((t) => t.id === id)!;
  const first = rng.pick(["flip_h", "flip_v"]);
  const second = difficulty === "easy" ? first : first === "flip_h" ? "flip_v" : "flip_h";
  const grid: Cell[] = [];
  for (let r = 0; r < ROWS; r++) {
    let a: Cell;
    let tries = 0;
    do {
      a = randomAsymmetricCell(rng);
      tries++;
    } while (
      tries < 50 &&
      (cellSimilarity(T("flip_h").apply(a), a) > 0.8 || cellSimilarity(T("flip_v").apply(a), a) > 0.8)
    );
    const b = T(first).apply(a);
    const c = T(second).apply(b);
    grid.push(a, b, c);
  }
  const prev = grid[7];
  const correct = grid[8];
  const wrong = [
    T(first === "flip_h" ? "flip_v" : "flip_h").apply(prev),
    T("rotate_90").apply(prev),
    T("rotate_-90").apply(prev),
    prev,
    T("rotate_180").apply(correct),
    T("translate_1_0").apply(correct),
    { objects: correct.objects.map((o, i) => (i === 0 ? { ...o, fill: (o.fill === 1 ? 0 : 1) as Fill } : o)) },
    { objects: correct.objects.map((o, i) => (i === 0 ? { ...o, rotation: mod(o.rotation + 90, 360) } : o)) },
  ];
  const desc =
    first === second
      ? `In each row each figure is the previous one ${T(first).describe}.`
      : `In each row the second figure is the first ${T(first).describe}, and the third is the second ${T(second).describe}.`;
  return finish(seed, "reflection", difficulty, grid, rng.shuffle(wrong), [{ attribute: "cell", kind: "reflection", axis: "row", description: desc }], rng);
}

// ---------------------------------------------------------------------------
// Composition / subtraction / XOR over a pool of small elements in slots

function generateComposition(seed: number, difficulty: Difficulty, rng: Rng) {
  const op = difficulty === "easy" ? "union" : difficulty === "medium" ? rng.pick(["union", "difference"]) : rng.pick(["xor", "difference", "union"]);
  const shape = rng.pick(["circle", "square", "triangle", "diamond"] as Shape[]);
  const fill = rng.pick([0, 1] as Fill[]);
  const mk = (slots: number[]): Cell => ({
    objects: slots.sort((a, b) => a - b).map((s) => ({ shape, fill, size: 0.3, rotation: 0, x: SLOT_COORDS[s][0], y: SLOT_COORDS[s][1] })),
  });
  const apply = (a: number[], b: number[]) => {
    const A = new Set(a);
    const B = new Set(b);
    if (op === "union") return [...new Set([...a, ...b])];
    if (op === "difference") return a.filter((x) => !B.has(x));
    return [...a.filter((x) => !B.has(x)), ...b.filter((x) => !A.has(x))];
  };
  const grid: Cell[] = [];
  const rowSets: number[][][] = [];
  for (let r = 0; r < ROWS; r++) {
    let a: number[];
    let b: number[];
    let c: number[];
    let tries = 0;
    do {
      a = rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8], rng.int(2, 4));
      b = op === "difference" ? [...rng.sample(a, rng.int(1, a.length - 1)), ...rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8].filter((x) => !a.includes(x)), rng.int(0, 1))] : rng.sample([0, 1, 2, 3, 4, 5, 6, 7, 8], rng.int(2, 4));
      c = apply(a, b);
      tries++;
    } while (tries < 50 && (c.length === 0 || c.length === 9 || sameSet(c, a) || sameSet(c, b) || sameSet(a, b)));
    rowSets.push([a, b, c]);
    if (r === 1 && competingOpFits(rowSets, op)) return null; // another operation would also explain rows 1–2
    grid.push(mk([...a]), mk([...b]), mk([...c]));
  }
  const [a, b, c] = rowSets[2];
  const alt = (fn: (x: number[], y: number[]) => number[]) => mk(fn(a, b));
  const union = (x: number[], y: number[]) => [...new Set([...x, ...y])];
  const diff = (x: number[], y: number[]) => x.filter((v) => !y.includes(v));
  const xor = (x: number[], y: number[]) => [...diff(x, y), ...diff(y, x)];
  const inter = (x: number[], y: number[]) => x.filter((v) => y.includes(v));
  const wrong: Cell[] = [alt(union), alt(diff), alt(xor), alt(inter), alt((x, y) => diff(y, x))];
  const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((x) => !c.includes(x));
  if (free.length) wrong.push(mk([...c, rng.pick(free)]));
  if (c.length > 1) wrong.push(mk(c.filter((_, i) => i !== 0)));
  wrong.push(mk([...a]), mk([...b]));
  const desc =
    op === "union"
      ? "In each row the third cell overlays the first two (A + B = C)."
      : op === "difference"
        ? "In each row the third cell is the first with the elements of the second removed (A − B = C)."
        : "In each row the third cell keeps the elements that appear in exactly one of the first two (XOR).";
  return finish(seed, "composition", difficulty, grid, rng.shuffle(wrong), [{ attribute: "objects", kind: op, axis: "row", description: desc }], rng);
}

/** True if a different set operation also explains every complete row (ambiguous puzzle). */
function competingOpFits(rows: number[][][], op: string): boolean {
  const ops: Record<string, (a: number[], b: number[]) => number[]> = {
    union: (a, b) => [...new Set([...a, ...b])],
    difference: (a, b) => a.filter((x) => !b.includes(x)),
    xor: (a, b) => [...a.filter((x) => !b.includes(x)), ...b.filter((x) => !a.includes(x))],
    intersection: (a, b) => a.filter((x) => b.includes(x)),
  };
  return Object.entries(ops).some(([name, fn]) => name !== op && rows.every(([a, b, c]) => sameSet(fn(a, b), c)));
}

function sameSet(a: number[], b: number[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

// ---------------------------------------------------------------------------
// Alternation: A B A in each row (whole-cell)

function randomCell(rng: Rng): Cell {
  const count = rng.int(1, 3);
  const shape = rng.pick(PLAIN_SHAPES);
  const fill = rng.pick([0, 0.5, 1] as Fill[]);
  const slots = COUNT_LAYOUT_SLOTS[count];
  const size = count === 1 ? rng.pick([0.5, 0.7]) : 0.3;
  return { objects: slots.map((s) => ({ shape, fill, size, rotation: 0, x: SLOT_COORDS[s][0], y: SLOT_COORDS[s][1] })) };
}

function generateAlternation(seed: number, difficulty: Difficulty, rng: Rng) {
  const grid: Cell[] = [];
  const pairs: [Cell, Cell][] = [];
  for (let r = 0; r < ROWS; r++) {
    let a: Cell;
    let b: Cell;
    do {
      a = randomCell(rng);
      b = randomCell(rng);
    } while (cellSimilarity(a, b) > 0.8);
    pairs.push([a, b]);
    grid.push(a, b, a);
  }
  const [a, b] = pairs[2];
  const tweak = (c: Cell, f: (o: MatrixObject) => MatrixObject): Cell => ({ objects: c.objects.map(f) });
  const wrong: Cell[] = [
    b,
    tweak(a, (o) => ({ ...o, fill: (o.fill === 1 ? 0 : 1) as Fill })),
    tweak(a, (o) => ({ ...o, shape: o.shape === "circle" ? "square" : "circle" })),
    pairs[1][0],
    pairs[0][0],
    tweak(b, (o) => ({ ...o, fill: (o.fill === 1 ? 0 : 1) as Fill })),
    tweak(a, (o) => ({ ...o, size: o.size > 0.4 ? (o.size > 0.6 ? 0.5 : 0.7) : o.size, shape: o.size > 0.4 ? o.shape : o.shape === "star" ? "cross" : "star" })),
  ];
  return finish(
    seed,
    "alternation",
    difficulty,
    grid,
    wrong,
    [{ attribute: "cell", kind: "alternation", axis: "row", description: "In each row the figures alternate A → B → A: the third cell repeats the first." }],
    rng,
  );
}


// ---------------------------------------------------------------------------
// Overlay ("line pattern") questions: texture layers combined along rows or
// columns, e.g. background lines add up down each column while thick bars add
// up along each row.

type Layer = "lines" | "bars" | "dots";
type LayerOp = "union" | "xor" | "difference";
type LAxis = "row" | "col";

const LAYER_WORD: Record<Layer, string> = { lines: "background lines", bars: "thick bars", dots: "dots" };
const DOT_PAIRS: string[][] = [["tl", "br"], ["tr", "bl"], ["c"], ["tl", "tr"], ["bl", "br"]];

/** Values of one layer for the 9 cells (row-major). */
function buildLayer(layer: Layer, axis: LAxis, op: LayerOp, rng: Rng, onlyLines: number[] | null, depth = 0): string[][] {
  const out: string[][] = Array.from({ length: 9 }, () => []);
  const pool: readonly string[] = layer === "lines" ? LINE_TOKENS : BAR_TOKENS;
  const usedPairs = new Set<string>();
  for (let line = 0; line < 3; line++) {
    let A: string[] = [];
    let B: string[] = [];
    if (onlyLines === null || onlyLines.includes(line)) {
      if (layer === "dots") {
        const [p, q] = rng.sample(DOT_PAIRS, 2);
        const disjoint = !p.some((t) => q.includes(t));
        if (!disjoint) return depth > 20 ? out : buildLayer(layer, axis, op, rng, onlyLines, depth + 1);
        A = p;
        B = q;
      } else if (op === "union") {
        [A, B] = rng.sample(pool, 2).map((t) => [t]);
      } else if (op === "xor") {
        const [a, b, x] = rng.sample(pool, 3);
        A = [a, x];
        B = [b, x];
      } else {
        const [a, b] = rng.sample(pool, 2);
        A = [a, b];
        B = [b];
      }
    }
    // Each line uses different elements, so the intended rule is the only simple one.
    const key = [...A, ...B].sort().join("|");
    if (key && usedPairs.has(key)) {
      if (depth > 20) return out;
      return buildLayer(layer, axis, op, rng, onlyLines, depth + 1);
    }
    usedPairs.add(key);
    const setA = new Set(A);
    const setB = new Set(B);
    const C =
      op === "union"
        ? [...new Set([...A, ...B])]
        : op === "xor"
          ? [...A.filter((t) => !setB.has(t)), ...B.filter((t) => !setA.has(t))]
          : A.filter((t) => !setB.has(t));
    const idx = (k: number) => (axis === "row" ? line * 3 + k : k * 3 + line);
    out[idx(0)] = A;
    out[idx(1)] = B;
    out[idx(2)] = C;
  }
  return out;
}

const OP_TEXT: Record<LayerOp, string> = {
  union: "are the first two cells laid on top of each other",
  xor: "keep only what appears in exactly one of the first two cells",
  difference: "are the first cell with the second cell's elements removed",
};

function generateOverlay(seed: number, difficulty: Difficulty, rng: Rng, unchecked = false): GeneratedMatrixQuestion | null {
  const axisA: LAxis = rng.bool() ? "row" : "col";
  const axisB: LAxis = axisA === "row" ? "col" : "row";
  const plan: { layer: Layer; axis: LAxis; op: LayerOp; only: number[] | null }[] = [{ layer: "lines", axis: axisA, op: difficulty === "expert" ? rng.pick(["xor", "difference"] as LayerOp[]) : "union", only: null }];
  if (difficulty !== "easy") plan.push({ layer: "bars", axis: axisB, op: "union", only: difficulty === "medium" ? null : [1, 2] });
  if (difficulty === "hard" || difficulty === "expert") plan.push({ layer: "dots", axis: axisB, op: "union", only: [0] });
  const layers: Record<Layer, string[][]> = { lines: Array.from({ length: 9 }, () => []), bars: Array.from({ length: 9 }, () => []), dots: Array.from({ length: 9 }, () => []) };
  for (const p of plan) layers[p.layer] = buildLayer(p.layer, p.axis, p.op, rng, p.only);
  // Every cell must show something.
  for (let i = 0; i < 9; i++) if (!layers.lines[i].length && !layers.bars[i].length && !layers.dots[i].length) return null;
  const cellAt = (i: number): Cell => ({ objects: [], pattern: { lines: [...layers.lines[i]], bars: [...layers.bars[i]], dots: [...layers.dots[i]] } });
  const grid = Array.from({ length: 9 }, (_, i) => cellAt(i));
  const correct = grid[8].pattern!;
  const mk = (patch: Partial<CellPattern>): Cell => ({ objects: [], pattern: { ...correct, ...patch } });
  const other = (pool: readonly string[], have: string[]) => rng.pick(pool.filter((t) => !have.includes(t)));
  const wrong: Cell[] = rng.shuffle([
    mk({ lines: correct.lines.slice(0, Math.max(0, correct.lines.length - 1)) }),
    mk({ lines: [...correct.lines, other(LINE_TOKENS, correct.lines)] }),
    mk({ lines: [...grid[5].pattern!.lines] }),
    mk({ lines: [...grid[7].pattern!.lines] }),
    mk({ bars: correct.bars.length ? correct.bars.slice(1) : [rng.pick(BAR_TOKENS)] }),
    mk({ bars: [...correct.bars, other(BAR_TOKENS, correct.bars)] }),
    mk({ bars: [...grid[5].pattern!.bars] }),
    mk({ dots: correct.dots.length ? [] : ["tl", "tr", "bl", "br"] }),
    mk({ dots: correct.dots.length ? [] : ["tl", "br"], lines: [...grid[2].pattern!.lines] }),
  ]);
  const rules: RuleDescriptor[] = plan.map((p) => ({
    attribute: p.layer,
    kind: p.op,
    axis: p.axis,
    description: `In each ${p.axis === "row" ? "row" : "column"} the ${LAYER_WORD[p.layer]} of the last cell ${OP_TEXT[p.op]}.`,
  }));
  const q = finish(seed, "overlay", difficulty, grid, wrong, rules, rng);
  if (!q || unchecked) return q;
  // Only keep questions the solver answers unambiguously with the intended option.
  const s = solveMatrix(q.problem);
  return s.status === "solved" && s.answer === q.correctAnswer ? q : null;
}

// ---------------------------------------------------------------------------
// Rolling-block questions: one square rolls around a fixed figure of squares.

const BASES: Record<number, Pt[][]> = {
  2: [[[0, 0], [1, 0]]],
  3: [
    [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [1, 0], [1, 1]],
  ],
  4: [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [2, 0], [1, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 2]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[0, 0], [1, 0], [2, 0], [3, 0]],
  ],
};

const rot90 = (cells: Pt[]): Pt[] => cells.map(([x, y]) => [-y, x] as Pt);
const mirror = (cells: Pt[]): Pt[] => cells.map(([x, y]) => [-x, y] as Pt);
function norm(cells: Pt[]): Pt[] {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my] as Pt);
}
const blockCell = (cells: Pt[]): Cell => ({ objects: [], blocks: norm(cells) });

function generateRolling(seed: number, difficulty: Difficulty, rng: Rng): GeneratedMatrixQuestion | null {
  const sizes: Record<Difficulty, number[]> = { easy: [2, 3], medium: [3, 3, 4], hard: [4], expert: [4] };
  const step = difficulty === "expert" ? rng.pick([2, -2]) : difficulty === "hard" ? rng.pick([1, -1]) : 1;
  const grid: Cell[] = [];
  const bases: Pt[][] = [];
  const used = new Set<string>();
  let lastIdx = 0;
  for (let r = 0; r < 3; r++) {
    let base = rng.pick(BASES[rng.pick(sizes[difficulty])]);
    for (let k = rng.int(0, 3); k > 0; k--) base = rot90(base);
    if (rng.bool()) base = mirror(base);
    base = norm(base);
    const key = shapeKey(base);
    if (used.has(key)) return null; // a different fixed figure in every row
    used.add(key);
    bases.push(base);
    const pos = rollPositions(base);
    if (Math.abs(step) * 2 >= pos.length) return null;
    const i0 = rng.int(0, pos.length - 1);
    for (let k = 0; k < 3; k++) grid.push(blockCell([...base, pos[((i0 + k * step) % pos.length + pos.length) % pos.length]]));
    lastIdx = i0 + 2 * step;
  }
  const base = bases[2];
  const pos = rollPositions(base);
  const at = (i: number) => pos[((i % pos.length) + pos.length) % pos.length];
  const idx = lastIdx;
  const correct = grid[8].blocks!;
  const wrong: Cell[] = rng.shuffle([
    blockCell([...base, at(idx + step)]),
    blockCell([...base, at(idx - step)]),
    blockCell([...base, at(idx + 2 * step)]),
    blockCell([...base, at(idx - 2 * step)]),
    blockCell([...base, at(idx + 1)]),
    blockCell([...base, at(idx - 1)]),
    blockCell(mirror(correct)),
    blockCell(rot90(correct)),
    blockCell(base),
    grid[7],
  ]);
  const dir = step > 0 ? "clockwise" : "counter-clockwise";
  const rules: RuleDescriptor[] = [
    {
      attribute: "cell",
      kind: "rolling",
      axis: "row",
      description: `In each row one square rolls ${Math.abs(step) === 1 ? "one step" : `${Math.abs(step)} steps`} ${dir} around the rest of the figure, which stays the same.`,
    },
  ];
  const q = finish(seed, "rolling", difficulty, grid, wrong, rules, rng);
  if (!q) return null;
  const s = solveMatrix(q.problem);
  return s.status === "solved" && s.answer === q.correctAnswer ? q : null;
}

// ---------------------------------------------------------------------------
// Growing-petal questions: a flower of rhombus petals gains one petal per step;
// along rows it grows at one end of the arc, down columns at the other end (or
// the whole flower turns).

const wrap360 = (a: number) => ((a % 360) + 360) % 360;
const arc = (start: number, count: number): number[] => Array.from({ length: count }, (_, i) => wrap360(start + 45 * i));
const petalCell = (petals: number[]): Cell => ({ objects: [], petals });

function generatePetals(seed: number, difficulty: Difficulty, rng: Rng): GeneratedMatrixQuestion | null {
  const s0 = 45 * rng.int(0, 7);
  // start(r, c) = counter-clockwise end, count(r, c) = number of petals.
  const plans: Record<Difficulty, { start: (r: number, c: number) => number; count: (r: number, c: number) => number; rows: string; cols: string }> = {
    easy: { start: (r) => s0 + 90 * r, count: (_r, c) => c + 1, rows: "a petal is added clockwise", cols: "the whole flower turns 90° clockwise" },
    medium: { start: (r) => s0 - 45 * r, count: (r, c) => r + c + 1, rows: "a petal is added clockwise", cols: "a petal is added counter-clockwise" },
    hard: { start: (_r, c) => s0 - 45 * c, count: (r, c) => r + c + 1, rows: "a petal is added counter-clockwise", cols: "a petal is added clockwise" },
    expert: { start: (r) => s0 + 45 * r, count: (r, c) => r + c + 1, rows: "a petal is added clockwise", cols: "the flower turns 90° clockwise and gains a petal counter-clockwise" },
  };
  const plan = plans[difficulty];
  const grid: Cell[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push(petalCell(arc(plan.start(r, c), plan.count(r, c))));
  const st = plan.start(2, 2);
  const n = plan.count(2, 2);
  const wrong: Cell[] = rng.shuffle([
    petalCell(arc(st + 45, n)), // right number, turned: fits the count rule only
    petalCell(arc(st - 45, n)),
    petalCell(arc(st + 90, n)),
    petalCell(arc(st, n - 1)),
    petalCell(arc(st + 45, n - 1)),
    petalCell(arc(st, n + 1)),
    petalCell(arc(st - 45, n + 1)),
    petalCell(arc(st, n).map((a) => wrap360(-a))), // mirror image
    grid[7],
  ]);
  const rules: RuleDescriptor[] = [
    { attribute: "petals", kind: "progression", axis: "row", description: `Along each row ${plan.rows} at each step.` },
    { attribute: "petals", kind: "progression", axis: "col", description: `Down each column ${plan.cols} at each step.` },
  ];
  const q = finish(seed, "petals", difficulty, grid, wrong, rules, rng);
  if (!q) return null;
  const s = solveMatrix(q.problem);
  return s.status === "solved" && s.answer === q.correctAnswer ? q : null;
}

// ---------------------------------------------------------------------------

export interface GenerateOptions {
  category?: MatrigmaCategory;
  difficulty?: Difficulty;
  seed?: number;
}

const DEFAULT_DIFFICULTY: Record<MatrigmaCategory, Difficulty> = {
  rotation: "easy",
  reflection: "medium",
  count: "easy",
  position: "easy",
  shape: "easy",
  fill: "easy",
  size: "easy",
  direction: "easy",
  composition: "medium",
  alternation: "easy",
  overlay: "medium",
  rolling: "medium",
  petals: "medium",
  "multi-rule": "hard",
};

export function generateQuestion(opts: GenerateOptions = {}): GeneratedMatrixQuestion {
  let seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  for (let attempt = 0; attempt < 200; attempt++, seed = (seed * 1103515245 + 12345) >>> 1) {
    const rng = new Rng(seed);
    const category = opts.category ?? rng.pick(MATRIGMA_CATEGORIES);
    let difficulty = opts.difficulty ?? DEFAULT_DIFFICULTY[category];
    if (category === "multi-rule" && (difficulty === "easy" || difficulty === "medium")) difficulty = "hard";
    let q: GeneratedMatrixQuestion | null;
    switch (category) {
      case "reflection":
        q = generateReflection(seed, difficulty, rng);
        break;
      case "composition":
        q = generateComposition(seed, difficulty, rng);
        break;
      case "alternation":
        q = generateAlternation(seed, difficulty, rng);
        break;
      case "overlay":
        q = generateOverlay(seed, difficulty, rng);
        break;
      case "rolling":
        q = generateRolling(seed, difficulty, rng);
        break;
      case "petals":
        q = generatePetals(seed, difficulty, rng);
        break;
      default:
        q = generateAttributeQuestion(seed, category, difficulty, rng);
    }
    if (q) return q;
  }
  throw new Error("Failed to generate a valid question");
}

export function generateBatch(n: number, opts: Omit<GenerateOptions, "seed"> & { seedStart?: number } = {}): GeneratedMatrixQuestion[] {
  const start = opts.seedStart ?? Math.floor(Math.random() * 2 ** 30);
  return Array.from({ length: n }, (_, i) => generateQuestion({ ...opts, seed: start + i * 7919 }));
}

/** Test hook: overlay question without the solver check. */
export const __generateOverlayUnchecked = (seed: number, difficulty: Difficulty, rng: Rng) => generateOverlay(seed, difficulty, rng, true);
