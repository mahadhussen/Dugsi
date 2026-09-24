import type { MatrixProblem } from "../matrigma/types";

export type Axis = "row" | "col" | "diag" | "sequence";

/** An ordered group of cell indices that a rule is evaluated over. */
export interface Line {
  axis: Axis;
  index: number;
  cells: number[];
  label: string;
}

export const AXIS_WORD: Record<Axis, string> = {
  row: "row",
  col: "column",
  diag: "diagonal",
  sequence: "sequence window",
};

export function buildLines(p: MatrixProblem, axis: Axis): Line[] {
  const { rows, cols } = p;
  const lines: Line[] = [];
  if (axis === "sequence") {
    if (rows !== 1) return [];
    for (let i = 0; i + 2 < cols; i++) {
      lines.push({ axis, index: i, cells: [i, i + 1, i + 2], label: `Cells ${i + 1}–${i + 3}` });
    }
    return lines;
  }
  if (rows < 2 || cols < 2) return [];
  if (axis === "row") {
    for (let r = 0; r < rows; r++) {
      lines.push({ axis, index: r, cells: Array.from({ length: cols }, (_, c) => r * cols + c), label: `Row ${r + 1}` });
    }
  } else if (axis === "col") {
    for (let c = 0; c < cols; c++) {
      lines.push({ axis, index: c, cells: Array.from({ length: rows }, (_, r) => r * cols + c), label: `Column ${c + 1}` });
    }
  } else if (axis === "diag") {
    if (rows !== cols || rows < 3) return [];
    // Wrapped diagonals (top-left to bottom-right), as in Latin-square designs.
    for (let k = 0; k < cols; k++) {
      lines.push({
        axis,
        index: k,
        cells: Array.from({ length: rows }, (_, r) => r * cols + ((r + k) % cols)),
        label: `Diagonal ${k + 1}`,
      });
    }
  }
  return lines;
}

export function axesFor(p: MatrixProblem): Axis[] {
  return p.rows === 1 ? ["sequence"] : ["row", "col", "diag"];
}
