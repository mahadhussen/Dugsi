/**
 * Structured representation of Matrigma-like matrix problems.
 *
 * Every cell is a list of objects. Both the synthetic generator and the
 * computer-vision pipeline produce this representation, and the solver works
 * exclusively on it (never on pixels), so visual verification is explicit.
 */

export const SHAPES = [
  "circle",
  "square",
  "diamond",
  "triangle",
  "pentagon",
  "hexagon",
  "star",
  "arrow",
  "cross",
  "line",
] as const;
export type Shape = (typeof SHAPES)[number];

/** 0 = outline only, 0.5 = half filled, 1 = solid. */
export type Fill = 0 | 0.5 | 1;

export interface MatrixObject {
  shape: Shape;
  fill: Fill;
  /** Circumradius relative to the cell half-size (0..1). */
  size: number;
  /** Degrees clockwise from the canonical "pointing up" orientation. */
  rotation: number;
  /** Centre position inside the cell, 0..1 on both axes (y grows downwards). */
  x: number;
  y: number;
}

/**
 * Texture layers used by overlay ("line pattern") questions. Each layer is a
 * set of tokens; rules combine them along rows or columns (union, XOR, …).
 */
export const LINE_TOKENS = ["v", "h", "d", "a", "arc-up", "arc-down"] as const;
export const BAR_TOKENS = ["v", "h", "d", "a"] as const;
export const DOT_TOKENS = ["tl", "tr", "bl", "br", "c"] as const;
export interface CellPattern {
  /** Thin line families filling the cell: vertical, horizontal, diagonal (/), anti-diagonal (\\), arcs. */
  lines: string[];
  /** Thick bars through the centre. */
  bars: string[];
  /** Solid dots: corners (tl, tr, bl, br) and centre (c). */
  dots: string[];
}

export interface Cell {
  objects: MatrixObject[];
  pattern?: CellPattern;
  /** A figure built from unit squares, as [x, y] grid cells (rolling-block questions). */
  blocks?: [number, number][];
  /** Petals radiating from the centre, as angles in degrees clockwise from up (growing-petal questions). */
  petals?: number[];
}

export interface MatrixProblem {
  rows: number;
  cols: number;
  /** Row-major; exactly one entry is null (the missing cell). */
  cells: (Cell | null)[];
  options: Cell[];
}

export type Difficulty = "easy" | "medium" | "hard" | "expert";
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

export const MATRIGMA_CATEGORIES = [
  "rotation",
  "reflection",
  "count",
  "position",
  "shape",
  "fill",
  "size",
  "direction",
  "composition",
  "alternation",
  "overlay",
  "rolling",
  "petals",
  "multi-rule",
] as const;
export type MatrigmaCategory = (typeof MATRIGMA_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MatrigmaCategory, string> = {
  rotation: "Rotation",
  reflection: "Reflection",
  count: "Count",
  position: "Position",
  shape: "Shape",
  fill: "Fill",
  size: "Size",
  direction: "Direction",
  composition: "Composition",
  alternation: "Alternation",
  overlay: "Line patterns",
  rolling: "Rolling block",
  petals: "Growing petals",
  "multi-rule": "Multi-rule",
};

export interface RuleDescriptor {
  attribute: string;
  kind: string;
  axis: "row" | "col" | "diag" | "sequence";
  description: string;
}

export interface GeneratedMatrixQuestion {
  id: string;
  seed: number;
  category: MatrigmaCategory;
  difficulty: Difficulty;
  problem: MatrixProblem;
  correctAnswer: number;
  rules: RuleDescriptor[];
  ruleText: string;
}

export function missingIndex(p: MatrixProblem): number {
  return p.cells.findIndex((c) => c === null);
}

export const OPTION_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];
