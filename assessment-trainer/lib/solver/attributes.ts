import type { CellFeatures } from "./features";

export type AttrKind = "numeric" | "angle" | "category" | "set";
export type AttrValue = number | string;

export type RuleKind =
  | "constant"
  | "progression"
  | "progression_line"
  | "distribute"
  | "alternation"
  | "add"
  | "subtract"
  | "union"
  | "difference"
  | "xor"
  | "intersection";

export interface AttrSpec {
  name: "count" | "shape" | "sides" | "fill" | "size" | "rotation" | "positions" | "objects" | "shapes" | "slotCol" | "slotRow" | "lines" | "bars" | "dots";
  /** Fixed modular period for "angle" attributes that are not rotations. */
  period?: number;
  label: string;
  kind: AttrKind;
  weight: number;
  /** Tolerance: differences up to `tol` count as equal. */
  tol: number;
  kinds: RuleKind[];
  get(f: CellFeatures): AttrValue | null;
}

const SET_OPS: RuleKind[] = ["union", "difference", "xor", "intersection"];

export const ATTRIBUTES: AttrSpec[] = [
  {
    name: "count",
    label: "number of objects",
    kind: "numeric",
    weight: 1,
    tol: 0.5,
    kinds: ["constant", "progression", "progression_line", "distribute", "alternation", "add", "subtract"],
    get: (f) => f.count,
  },
  {
    name: "shape",
    label: "shape",
    kind: "category",
    weight: 1,
    tol: 0,
    kinds: ["constant", "distribute", "alternation"],
    get: (f) => f.shape,
  },
  {
    name: "sides",
    label: "number of corners",
    kind: "numeric",
    weight: 0.6,
    tol: 0.5,
    kinds: ["progression", "progression_line"],
    get: (f) => f.sides,
  },
  {
    name: "fill",
    label: "fill",
    kind: "numeric",
    weight: 1,
    tol: 0.2,
    kinds: ["constant", "progression", "distribute", "alternation"],
    get: (f) => f.fill,
  },
  {
    name: "size",
    label: "size",
    kind: "numeric",
    weight: 1,
    tol: 0.07,
    kinds: ["constant", "progression", "progression_line", "distribute", "alternation"],
    get: (f) => f.size,
  },
  {
    name: "rotation",
    label: "rotation",
    kind: "angle",
    weight: 1,
    tol: 12,
    kinds: ["constant", "progression", "progression_line", "distribute", "alternation"],
    get: (f) => f.rotation,
  },
  {
    name: "slotCol",
    label: "horizontal position",
    kind: "angle",
    period: 3,
    weight: 1,
    tol: 0.3,
    kinds: ["constant", "progression", "distribute", "alternation"],
    get: (f) => f.slotCol,
  },
  {
    name: "slotRow",
    label: "vertical position",
    kind: "angle",
    period: 3,
    weight: 1,
    tol: 0.3,
    kinds: ["constant", "progression", "distribute", "alternation"],
    get: (f) => f.slotRow,
  },
  {
    name: "positions",
    label: "positions",
    kind: "set",
    weight: 1,
    tol: 0,
    kinds: ["constant", "distribute", "alternation", ...SET_OPS],
    get: (f) => f.positions,
  },
  {
    name: "objects",
    label: "set of elements",
    kind: "set",
    weight: 1,
    tol: 0,
    kinds: ["constant", "distribute", "alternation", ...SET_OPS],
    get: (f) => f.objects,
  },
  {
    name: "shapes",
    label: "mix of shapes",
    kind: "category",
    weight: 0.5,
    tol: 0,
    kinds: ["constant", "distribute", "alternation"],
    get: (f) => f.shapes,
  },
  // Texture layers of overlay questions (null for ordinary cells, so they are skipped there).
  {
    name: "lines",
    label: "background lines",
    kind: "set",
    weight: 1,
    tol: 0,
    kinds: ["constant", "distribute", "alternation", ...SET_OPS],
    get: (f) => f.lines,
  },
  {
    name: "bars",
    label: "thick bars",
    kind: "set",
    weight: 1,
    tol: 0,
    kinds: ["constant", "distribute", "alternation", ...SET_OPS],
    get: (f) => f.bars,
  },
  {
    name: "dots",
    label: "dots",
    kind: "set",
    weight: 1,
    tol: 0,
    kinds: ["constant", "distribute", "alternation", ...SET_OPS],
    get: (f) => f.dots,
  },
];

// Object attributes say nothing about pure texture cells (0 objects everywhere
// would "prove" rules like 0 + 0 = 0), so they are skipped for those cells.
const LAYER_ATTRS = new Set(["lines", "bars", "dots"]);
for (const a of ATTRIBUTES) {
  if (LAYER_ATTRS.has(a.name)) continue;
  const get = a.get;
  a.get = (f) => (f.patternOnly ? null : get(f));
}

export const RULE_COMPLEXITY: Record<RuleKind, number> = {
  constant: 1,
  progression: 1.5,
  progression_line: 2.5,
  distribute: 2,
  alternation: 2,
  add: 2.5,
  subtract: 2.5,
  union: 2.5,
  difference: 2.5,
  xor: 2.5,
  intersection: 3,
};
