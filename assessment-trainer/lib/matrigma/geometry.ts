import type { Shape } from "./types";

/**
 * Rotational symmetry period (degrees) for each shape. Rotations are compared
 * modulo this period, e.g. a triangle rotated 120° looks identical to 0°.
 * 0 means the shape is rotation invariant.
 */
export const SYMMETRY_PERIOD: Record<Shape, number> = {
  circle: 0,
  square: 90,
  diamond: 90,
  triangle: 120,
  pentagon: 72,
  hexagon: 60,
  star: 72,
  arrow: 360,
  cross: 90,
  line: 180,
};

/** Number of corners, used for the "shape progression" rule. */
export const SHAPE_SIDES: Partial<Record<Shape, number>> = {
  triangle: 3,
  square: 4,
  pentagon: 5,
  hexagon: 6,
};

export function normRotation(shape: Shape, rotation: number): number {
  const p = SYMMETRY_PERIOD[shape];
  if (!p) return 0;
  const r = ((rotation % p) + p) % p;
  return Math.abs(r - p) < 1e-6 ? 0 : r;
}

/** Smallest angular distance between two rotations of the same shape. */
export function rotationDistance(shape: Shape, a: number, b: number): number {
  const p = SYMMETRY_PERIOD[shape];
  if (!p) return 0;
  const d = Math.abs(normRotation(shape, a) - normRotation(shape, b));
  return Math.min(d, p - d);
}

function regular(n: number, r: number, startDeg = -90): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 / n) * i) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Polygon outline of a shape centred at the origin with circumradius r, in the
 * canonical (rotation 0) orientation. Circle and line are special-cased by the
 * renderer. Coordinates: y grows downwards (SVG / image convention).
 */
export function shapePolygon(shape: Shape, r: number): [number, number][] {
  switch (shape) {
    case "square":
      return regular(4, r, -135);
    case "diamond":
      return regular(4, r, -90);
    case "triangle":
      return regular(3, r, -90);
    case "pentagon":
      return regular(5, r, -90);
    case "hexagon":
      return regular(6, r, -90);
    case "star": {
      const outer = regular(5, r, -90);
      const inner = regular(5, r * 0.45, -54);
      return outer.flatMap((p, i) => [p, inner[i]]);
    }
    case "arrow": {
      // Points up. Head is wider than the shaft so the centroid sits towards
      // the head, which the vision pipeline uses to recover direction.
      const w = r * 0.28;
      const hw = r * 0.7;
      const hy = -r * 0.1;
      return [
        [0, -r],
        [hw, hy],
        [w, hy],
        [w, r],
        [-w, r],
        [-w, hy],
        [-hw, hy],
      ];
    }
    case "cross": {
      const t = r * 0.3;
      return [
        [-t, -r], [t, -r], [t, -t], [r, -t], [r, t], [t, t],
        [t, r], [-t, r], [-t, t], [-r, t], [-r, -t], [-t, -t],
      ];
    }
    default:
      return regular(24, r, -90);
  }
}

export function rotatePoint([x, y]: [number, number], deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
}

/** 3x3 slot grid inside a cell, used for positions and counts. */
export const SLOT_COORDS: [number, number][] = [
  [0.2, 0.2], [0.5, 0.2], [0.8, 0.2],
  [0.2, 0.5], [0.5, 0.5], [0.8, 0.5],
  [0.2, 0.8], [0.5, 0.8], [0.8, 0.8],
];

export function slotOf(x: number, y: number): number {
  const col = x < 0.35 ? 0 : x > 0.65 ? 2 : 1;
  const row = y < 0.35 ? 0 : y > 0.65 ? 2 : 1;
  return row * 3 + col;
}

export const SLOT_NAMES = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right",
];
