import type { Cell, MatrixObject } from "../matrigma/types";
import { rotationDistance } from "../matrigma/geometry";

/** Similarity of two objects in [0,1]. */
export function objectSimilarity(a: MatrixObject, b: MatrixObject): number {
  const shape = a.shape === b.shape ? 1 : 0;
  const fill = 1 - Math.min(1, Math.abs(a.fill - b.fill) * 2);
  const size = Math.max(0, 1 - Math.max(0, Math.abs(a.size - b.size) - 0.05) / 0.15);
  let rot = 1;
  if (a.shape === b.shape) {
    const d = rotationDistance(a.shape, a.rotation, b.rotation);
    rot = Math.max(0, 1 - Math.max(0, d - 8) / 25);
  } else {
    rot = 0.5;
  }
  const dist = Math.hypot(a.x - b.x, a.y - b.y);
  const pos = Math.max(0, 1 - Math.max(0, dist - 0.06) / 0.18);
  return 0.3 * shape + 0.2 * fill + 0.15 * size + 0.2 * rot + 0.15 * pos;
}

function patternTokens(c: Cell): Set<string> {
  const p = c.pattern;
  if (!p) return new Set();
  return new Set([...p.lines.map((t) => `l:${t}`), ...p.bars.map((t) => `b:${t}`), ...p.dots.map((t) => `d:${t}`)]);
}

/** Jaccard similarity of the texture layers (1 when neither cell has a pattern). */
export function patternSimilarity(a: Cell, b: Cell): number {
  if (!a.pattern && !b.pattern) return 1;
  const A = patternTokens(a);
  const B = patternTokens(b);
  const union = new Set([...A, ...B]);
  if (!union.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / union.size;
}

/**
 * Similarity of two cells in [0,1] using greedy best-pair object matching.
 * Unmatched objects count as zero similarity.
 */
export function cellSimilarity(a: Cell, b: Cell): number {
  return matchCells(a, b).mean * patternSimilarity(a, b);
}

/**
 * Strict similarity: the worst matched object pair (0 if counts differ).
 * Used when verifying that a transformation maps one cell exactly onto another.
 */
export function cellSimilarityStrict(a: Cell, b: Cell): number {
  if (a.objects.length !== b.objects.length) return 0;
  const p = patternSimilarity(a, b);
  return p < 1 ? 0 : matchCells(a, b).min;
}

function matchCells(a: Cell, b: Cell): { mean: number; min: number } {
  const na = a.objects.length;
  const nb = b.objects.length;
  if (na === 0 && nb === 0) return { mean: 1, min: 1 };
  if (na === 0 || nb === 0) return { mean: 0, min: 0 };
  const pairs: { i: number; j: number; s: number }[] = [];
  for (let i = 0; i < na; i++) {
    for (let j = 0; j < nb; j++) {
      pairs.push({ i, j, s: objectSimilarity(a.objects[i], b.objects[j]) });
    }
  }
  pairs.sort((p, q) => q.s - p.s);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  let total = 0;
  let min = 1;
  for (const p of pairs) {
    if (usedA.has(p.i) || usedB.has(p.j)) continue;
    usedA.add(p.i);
    usedB.add(p.j);
    total += p.s;
    min = Math.min(min, p.s);
  }
  if (na !== nb) min = 0;
  return { mean: total / Math.max(na, nb), min };
}

/** True if two cells are visually equivalent (within tolerance). */
export function cellsEqual(a: Cell, b: Cell, threshold = 0.9): boolean {
  return cellSimilarityStrict(a, b) >= threshold;
}
