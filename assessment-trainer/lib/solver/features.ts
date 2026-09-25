import type { Cell, MatrixObject, Shape } from "../matrigma/types";
import { normRotation, SHAPE_SIDES, SYMMETRY_PERIOD, slotOf } from "../matrigma/geometry";

/**
 * Cell-level attribute extraction. Each attribute is either a concrete value
 * or null when it is not well defined for the cell (e.g. "rotation" of a cell
 * that mixes shapes). Rules are only fitted on non-null values.
 */
export interface CellFeatures {
  count: number;
  shape: Shape | null;
  sides: number | null;
  fill: number | null;
  size: number | null;
  rotation: number | null;
  /** Period of the rotation attribute (depends on the shape). */
  rotationPeriod: number;
  positions: string; // sorted slot ids, e.g. "0,4,8"
  /** Slot column / row (0..2) of a single primary object, for movement rules. */
  slotCol: number | null;
  slotRow: number | null;
  objects: string; // sorted object keys
  shapes: string; // sorted multiset of shapes
  /** Texture layers (null when the cell has no pattern). */
  lines: string | null;
  bars: string | null;
  dots: string | null;
  /** True for a texture-only cell (pattern, no objects). */
  patternOnly: boolean;
}

const layer = (v: string[] | undefined) => (v ? [...new Set(v)].sort().join(";") : null);

export function objectKey(o: MatrixObject): string {
  const rot = Math.round(normRotation(o.shape, o.rotation) / 15) * 15;
  return `${o.shape}|${slotOf(o.x, o.y)}|${rot}|${o.fill}`;
}

function uniform<T>(vals: T[], eq: (a: T, b: T) => boolean): T | null {
  if (vals.length === 0) return null;
  return vals.every((v) => eq(v, vals[0])) ? vals[0] : null;
}

/**
 * Primary objects: small decorative elements (less than 60% of the largest
 * object's size) are ignored for shape/fill/size/rotation so that a constant
 * distractor dot does not hide the real rule.
 */
export function primaryObjects(cell: Cell): MatrixObject[] {
  if (!cell.objects.length) return [];
  const max = Math.max(...cell.objects.map((o) => o.size));
  return cell.objects.filter((o) => o.size >= 0.6 * max);
}

export function cellFeatures(cell: Cell): CellFeatures {
  const all = cell.objects;
  const objs = primaryObjects(cell);
  const shape = uniform(objs.map((o) => o.shape), (a, b) => a === b);
  const fill = uniform(objs.map((o) => o.fill as number), (a, b) => Math.abs(a - b) < 0.2);
  const size = uniform(objs.map((o) => o.size), (a, b) => Math.abs(a - b) < 0.08);
  let rotation: number | null = null;
  let period = 0;
  if (shape) {
    period = SYMMETRY_PERIOD[shape];
    if (period) {
      const rots = objs.map((o) => normRotation(shape, o.rotation));
      const r0 = rots[0];
      const same = rots.every((r) => {
        const d = Math.abs(r - r0);
        return Math.min(d, period - d) < 10;
      });
      rotation = same ? r0 : null;
    }
  }
  const sizeMean = size === null ? null : objs.reduce((s, o) => s + o.size, 0) / objs.length;
  const single = objs.length === 1 ? slotOf(objs[0].x, objs[0].y) : null;
  return {
    slotCol: single === null ? null : single % 3,
    slotRow: single === null ? null : Math.floor(single / 3),
    count: all.length,
    shape,
    sides: shape ? SHAPE_SIDES[shape] ?? null : null,
    fill,
    size: sizeMean,
    rotation,
    rotationPeriod: period,
    positions: [...new Set(all.map((o) => slotOf(o.x, o.y)))].sort((a, b) => a - b).join(","),
    objects: all.map(objectKey).sort().join(";"),
    shapes: all.map((o) => o.shape).sort().join(","),
    lines: cell.pattern ? layer(cell.pattern.lines) : null,
    bars: cell.pattern ? layer(cell.pattern.bars) : null,
    dots: cell.pattern ? layer(cell.pattern.dots) : null,
    patternOnly: !!cell.pattern && all.length === 0,
  };
}
