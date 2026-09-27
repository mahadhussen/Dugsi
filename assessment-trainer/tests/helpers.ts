import { execSync } from "node:child_process";
import type { Cell, MatrixObject, MatrixProblem, Shape } from "@/lib/matrigma/types";

export function hasPython(): boolean {
  try {
    execSync(`${process.env.PYTHON_BIN || "python3"} -c "import cv2, numpy"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export const obj = (shape: Shape, extra: Partial<MatrixObject> = {}): MatrixObject => ({ shape, fill: 1, size: 0.6, rotation: 0, x: 0.5, y: 0.5, ...extra });
export const cell = (...objects: MatrixObject[]): Cell => ({ objects });

/** 3x3 problem from a cell function; bottom-right is missing; options given explicitly. */
export function problem(at: (r: number, c: number) => Cell, options: Cell[]): MatrixProblem {
  const cells: (Cell | null)[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push(r === 2 && c === 2 ? null : at(r, c));
  return { rows: 3, cols: 3, cells, options };
}
