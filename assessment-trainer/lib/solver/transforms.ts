import type { Cell, MatrixObject } from "../matrigma/types";
import { normRotation, SYMMETRY_PERIOD } from "../matrigma/geometry";

/**
 * Whole-cell transformations used by the transformation strategies.
 * A transformation maps a complete cell to a new cell.
 */
export interface CellTransform {
  id: string;
  family: "identity" | "rotation" | "reflection" | "translation";
  complexity: number;
  describe: string;
  apply(cell: Cell): Cell;
}

function mapObjects(cell: Cell, f: (o: MatrixObject) => MatrixObject): Cell {
  return { objects: cell.objects.map(f) };
}

function rotateCell(deg: number): CellTransform {
  return {
    id: `rotate_${deg}`,
    family: "rotation",
    complexity: 1.5,
    describe: deg > 0 ? `rotated ${deg}° clockwise` : `rotated ${-deg}° counter-clockwise`,
    apply: (cell) =>
      mapObjects(cell, (o) => {
        const a = (deg * Math.PI) / 180;
        const dx = o.x - 0.5;
        const dy = o.y - 0.5;
        return {
          ...o,
          x: 0.5 + dx * Math.cos(a) - dy * Math.sin(a),
          y: 0.5 + dx * Math.sin(a) + dy * Math.cos(a),
          rotation: normRotation(o.shape, o.rotation + deg),
        };
      }),
  };
}

const flipH: CellTransform = {
  id: "flip_h",
  family: "reflection",
  complexity: 1.5,
  describe: "mirrored left ↔ right",
  apply: (cell) =>
    mapObjects(cell, (o) => ({
      ...o,
      x: 1 - o.x,
      rotation: SYMMETRY_PERIOD[o.shape] ? normRotation(o.shape, -o.rotation) : 0,
    })),
};

const flipV: CellTransform = {
  id: "flip_v",
  family: "reflection",
  complexity: 1.5,
  describe: "mirrored top ↕ bottom",
  apply: (cell) =>
    mapObjects(cell, (o) => ({
      ...o,
      y: 1 - o.y,
      rotation: SYMMETRY_PERIOD[o.shape] ? normRotation(o.shape, 180 - o.rotation) : 0,
    })),
};

function wrapSlot(v: number, step: number): number {
  // Slot centres are 0.2 / 0.5 / 0.8. Shift by `step` slots with wrap-around.
  const idx = Math.round((v - 0.2) / 0.3);
  if (Math.abs(0.2 + idx * 0.3 - v) > 0.1) return v + step * 0.3; // not slot aligned
  const n = (((idx + step) % 3) + 3) % 3;
  return 0.2 + n * 0.3;
}

function translate(dx: number, dy: number): CellTransform {
  const dir = [dy < 0 ? "up" : dy > 0 ? "down" : "", dx < 0 ? "left" : dx > 0 ? "right" : ""]
    .filter(Boolean)
    .join("-");
  return {
    id: `translate_${dx}_${dy}`,
    family: "translation",
    complexity: 1.5,
    describe: `moved one step ${dir} (wrapping around the edge)`,
    apply: (cell) => mapObjects(cell, (o) => ({ ...o, x: wrapSlot(o.x, dx), y: wrapSlot(o.y, dy) })),
  };
}

const identity: CellTransform = {
  id: "identity",
  family: "identity",
  complexity: 1,
  describe: "unchanged",
  apply: (cell) => cell,
};

export const TRANSFORMS: CellTransform[] = [
  identity,
  rotateCell(90),
  rotateCell(-90),
  rotateCell(180),
  rotateCell(45),
  rotateCell(-45),
  flipH,
  flipV,
  translate(1, 0),
  translate(-1, 0),
  translate(0, 1),
  translate(0, -1),
  translate(1, 1),
];
