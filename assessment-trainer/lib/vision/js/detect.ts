/**
 * Matrix / cell / answer-option detection — port of python/vision/detect.py.
 * Cell interiors are found as enclosed, rectangular background regions.
 */
import { label, type Gray } from "./raster";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
const cxOf = (b: Box) => b.x + b.w / 2;
const cyOf = (b: Box) => b.y + b.h / 2;
const area = (b: Box) => b.w * b.h;
const contains = (a: Box, o: Box, pad = 2) => a.x - pad <= o.x && a.y - pad <= o.y && o.x + o.w <= a.x + a.w + pad && o.y + o.h <= a.y + a.h + pad;
function iou(a: Box, o: Box) {
  const ix = Math.max(0, Math.min(a.x + a.w, o.x + o.w) - Math.max(a.x, o.x));
  const iy = Math.max(0, Math.min(a.y + a.h, o.y + o.h) - Math.max(a.y, o.y));
  const inter = ix * iy;
  return inter / (area(a) + area(o) - inter);
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export class DetectionError extends Error {
  constructor(public stage: string, message: string, public region: Box | null = null, public boxes: Box[] = []) {
    super(message);
  }
}

/** Candidate boxes: enclosed background regions that are square and rectangular. */
export function squareBoxes(ink: Uint8Array, g: Gray): Box[] {
  const { w, h } = g;
  const minSide = Math.max(20, Math.floor(0.03 * Math.min(w, h)));
  const maxSide = Math.floor(0.6 * Math.min(w, h));
  const { labels, comps } = label(ink, w, h, 0, 4);
  const out: Box[] = [];
  for (const c of comps) {
    if (c.touchesBorder) continue;
    const bw = c.maxx - c.minx + 1;
    const bh = c.maxy - c.miny + 1;
    if (bw < minSide || bh < minSide || bw > maxSide || bh > maxSide) continue;
    if (bw / bh < 0.85 || bw / bh > 1.18) continue;
    if (c.count < 0.3 * bw * bh) continue; // thin rings between double lines
    // Straight edges: the region must fill most of its bounding-box border.
    let own = 0;
    let tot = 0;
    // Check one pixel inside the box: anti-aliased border pixels are ignored.
    const [x0, x1, y0, y1] = [c.minx + 1, c.maxx - 1, c.miny + 1, c.maxy - 1];
    for (let x = x0; x <= x1; x++) {
      tot += 2;
      if (labels[y0 * w + x] === c.label) own++;
      if (labels[y1 * w + x] === c.label) own++;
    }
    for (let y = y0; y <= y1; y++) {
      tot += 2;
      if (labels[y * w + x0] === c.label) own++;
      if (labels[y * w + x1] === c.label) own++;
    }
    if (own / tot < 0.8) continue;
    out.push({ x: c.minx, y: c.miny, w: bw, h: bh });
  }
  out.sort((a, b) => area(a) - area(b));
  const dedup: Box[] = [];
  for (const b of out) if (!dedup.some((o) => iou(b, o) > 0.75)) dedup.push(b);
  return dedup;
}

function cluster1d(values: number[], tol: number): number[] {
  const groups: number[][] = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(v - last.reduce((s, x) => s + x, 0) / last.length) <= tol) last.push(v);
    else groups.push([v]);
  }
  return groups.map((g) => g.reduce((s, x) => s + x, 0) / g.length);
}

function sizeGroups(boxes: Box[]): Box[][] {
  const groups: Box[][] = [];
  for (const b of [...boxes].sort((a, c) => c.w - a.w)) {
    const g = groups.find((gr) => {
      const rw = median(gr.map((x) => x.w));
      const rh = median(gr.map((x) => x.h));
      return Math.abs(b.w - rw) <= 0.1 * rw && Math.abs(b.h - rh) <= 0.1 * rw;
    });
    if (g) g.push(b);
    else groups.push([b]);
  }
  return groups.filter((g) => g.length >= 2);
}

export interface Lattice {
  rows: number;
  cols: number;
  xs: number[];
  ys: number[];
  size: number;
  cells: Map<string, Box>;
}

export const latticeMissing = (l: Lattice) => {
  const out: [number, number][] = [];
  for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) if (!l.cells.has(`${r},${c}`)) out.push([r, c]);
  return out;
};
export const slotBox = (l: Lattice, r: number, c: number): Box => {
  const s = Math.round(l.size);
  return { x: Math.round(l.xs[c] - s / 2), y: Math.round(l.ys[r] - s / 2), w: s, h: s };
};
export const latticeBox = (l: Lattice): Box => {
  const s = l.size;
  const x0 = Math.min(...l.xs) - s / 2;
  const y0 = Math.min(...l.ys) - s / 2;
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(Math.max(...l.xs) - Math.min(...l.xs) + s), h: Math.round(Math.max(...l.ys) - Math.min(...l.ys) + s) };
};

function fitLattice(group: Box[]): Lattice {
  const size = median(group.map((b) => b.w));
  const tol = 0.25 * size;
  const fill = (centers: number[]) => {
    if (centers.length < 2) return centers;
    let pitch = Infinity;
    for (let i = 1; i < centers.length; i++) pitch = Math.min(pitch, centers[i] - centers[i - 1]);
    const out = [centers[0]];
    for (const v of centers.slice(1)) {
      while (v - out[out.length - 1] > 1.5 * pitch) out.push(out[out.length - 1] + pitch);
      out.push(v);
    }
    return out;
  };
  const xs = fill(cluster1d(group.map(cxOf), tol));
  const ys = fill(cluster1d(group.map(cyOf), tol));
  const cells = new Map<string, Box>();
  for (const b of group) {
    let c = 0;
    let r = 0;
    xs.forEach((x, i) => Math.abs(cxOf(b) - x) < Math.abs(cxOf(b) - xs[c]) && (c = i));
    ys.forEach((y, i) => Math.abs(cyOf(b) - y) < Math.abs(cyOf(b) - ys[r]) && (r = i));
    if (Math.abs(cxOf(b) - xs[c]) <= tol && Math.abs(cyOf(b) - ys[r]) <= tol) cells.set(`${r},${c}`, b);
  }
  return { rows: ys.length, cols: xs.length, xs, ys, size, cells };
}

function pitchRatio(l: Lattice): number {
  const p: number[] = [];
  const diffs = (a: number[]) => a.slice(1).map((v, i) => v - a[i]);
  if (l.xs.length > 1) p.push(median(diffs(l.xs)));
  if (l.ys.length > 1) p.push(median(diffs(l.ys)));
  return p.length ? Math.min(...p) / l.size : 99;
}

export interface Layout {
  matrix: Lattice;
  options: Box[];
  missing: [number, number] | null;
  inferredOptions: number;
}

export function detectLayout(ink: Uint8Array, g: Gray): Layout {
  const boxes = squareBoxes(ink, g);
  if (boxes.length < 4) throw new DetectionError("matrix", "Too few box-like regions found; no matrix grid visible.", null, boxes);
  const groups = sizeGroups(boxes);
  let best: Lattice | null = null;
  let bestGroup: Box[] | null = null;
  for (const gr of groups) {
    const lat = fitLattice(gr);
    if (lat.rows * lat.cols < 4 || lat.rows < 2 || lat.cols < 2) continue;
    if (pitchRatio(lat) > 1.35) continue;
    if (lat.cells.size < lat.rows * lat.cols - 2) continue;
    if (!best || lat.size * lat.cells.size > best.size * best.cells.size) {
      best = lat;
      bestGroup = gr;
    }
  }
  if (!best) {
    const region = groups.length ? groups.reduce((a, b) => (b.reduce((s, x) => s + area(x), 0) > a.reduce((s, x) => s + area(x), 0) ? b : a)) : boxes;
    const x0 = Math.min(...region.map((b) => b.x));
    const y0 = Math.min(...region.map((b) => b.y));
    const x1 = Math.max(...region.map((b) => b.x + b.w));
    const y1 = Math.max(...region.map((b) => b.y + b.h));
    throw new DetectionError("matrix", "No tightly packed grid of equally sized cells was found.", { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, boxes);
  }
  const mb = latticeBox(best);
  let optBest: Box[] | null = null;
  for (let gr of groups) {
    if (gr === bestGroup) continue;
    gr = gr.filter((b) => !contains(mb, b, 6));
    if (gr.length < 3 || gr.length > 8) continue;
    if (gr.some((b) => boxes.some((o) => contains(o, b, 2) && area(o) > 1.5 * area(b)))) continue;
    const rows = cluster1d(gr.map(cyOf), 0.3 * median(gr.map((b) => b.h)));
    if (rows.length > 2) continue;
    if (!optBest || median(gr.map((b) => b.w)) > median(optBest.map((b) => b.w))) optBest = gr;
  }
  if (!optBest) throw new DetectionError("options", "The matrix was found but no row of answer options was detected.", mb, boxes);
  const rows = cluster1d(optBest.map(cyOf), 0.3 * median(optBest.map((b) => b.h)));
  const rowOf = (b: Box) => rows.reduce((bi, r, i) => (Math.abs(cyOf(b) - r) < Math.abs(cyOf(b) - rows[bi]) ? i : bi), 0);
  const sorted = [...optBest].sort((a, b) => rowOf(a) - rowOf(b) || cxOf(a) - cxOf(b));
  // Fill gaps in evenly spaced option rows (a broken option border).
  const options: Box[] = [];
  let inferred = 0;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = sorted.filter((b) => rowOf(b) === ri);
    if (row.length < 2) {
      options.push(...row);
      continue;
    }
    let pitch = Infinity;
    for (let i = 1; i < row.length; i++) pitch = Math.min(pitch, cxOf(row[i]) - cxOf(row[i - 1]));
    const filled = [row[0]];
    for (const b of row.slice(1)) {
      while (cxOf(b) - cxOf(filled[filled.length - 1]) > 1.5 * pitch) {
        const p = filled[filled.length - 1];
        filled.push({ x: Math.round(p.x + pitch), y: p.y, w: p.w, h: p.h });
        inferred++;
      }
      filled.push(b);
    }
    options.push(...filled);
  }
  const missing = latticeMissing(best);
  return { matrix: best, options, missing: missing.length === 1 ? missing[0] : null, inferredOptions: inferred };
}
