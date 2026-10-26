import type { Cell, Fill, MatrixProblem, Shape } from "../matrigma/types";
import { SHAPES } from "../matrigma/types";
import type { VisionSuccess } from "./types";

/** Convert the raw vision output into a typed MatrixProblem (unknown shapes kept as "circle" is NOT done: they are dropped and lower quality). */
export function toProblem(v: VisionSuccess): { problem: MatrixProblem; unknownObjects: number } {
  let unknown = 0;
  const conv = (c: Cell | null): Cell | null => {
    if (!c) return null;
    return {
      objects: c.objects
        .filter((o) => {
          const ok = (SHAPES as readonly string[]).includes(o.shape);
          if (!ok) unknown++;
          return ok;
        })
        .map((o) => ({
          shape: o.shape as Shape,
          fill: (o.fill >= 0.75 ? 1 : o.fill >= 0.25 ? 0.5 : 0) as Fill,
          size: o.size,
          rotation: o.rotation,
          x: o.x,
          y: o.y,
        })),
    };
  };
  return {
    problem: {
      rows: v.problem.rows,
      cols: v.problem.cols,
      cells: v.problem.cells.map(conv),
      options: v.problem.options.map((c) => conv(c)!),
    },
    unknownObjects: unknown,
  };
}
