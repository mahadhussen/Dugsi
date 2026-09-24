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

export interface Cell {
  objects: MatrixObject[];
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
