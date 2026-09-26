/**
 * Object segmentation and features inside one cell — a TypeScript port of
 * python/vision/objects.py that works on plain pixel arrays (runs in the
 * browser). Conventions match lib/matrigma/types.ts.
 */
import { approxClosed, convexHull, label, otsu, perimeter, polygonArea, type Gray, type Pt } from "./raster";

export const PERIOD: Record<string, number> = {
  circle: 0, square: 90, diamond: 90, triangle: 120, pentagon: 72, hexagon: 60, star: 72, arrow: 360, cross: 90, line: 180,
};

export interface JsObject {
  shape: string;
  fill: number;
  size: number;
  rotation: number;
  x: number;
  y: number;
  confidence: number;
  bbox: number[]; // crop coordinates (relative to the cell box)
}

const angleCwFromUp = (dx: number, dy: number) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;

function circularMean(angles: number[], period: number): number {
  if (!angles.length) return 0;
  const k = (2 * Math.PI) / period;
  let s = 0;
  let c = 0;
  for (const a of angles) {
    s += Math.sin(a * k);
    c += Math.cos(a * k);
  }
  return (((Math.atan2(s, c) / k) % period) + period) % period;
}

function quantize(angle: number, step: number, period: number): number {
  if (!period) return 0;
  const q = Math.round(angle / step) * step;
  return ((q % period) + period) % period;
}

function polygonRotation(vertices: Pt[], cx: number, cy: number, period: number): { rot: number; spread: number } {
  const angs = vertices.map(([x, y]) => (((angleCwFromUp(x - cx, y - cy)) % period) + period) % period);
  const mean = circularMean(angs, period);
  let spread = 0;
  for (const a of angs) spread = Math.max(spread, Math.min(Math.abs(a - mean), period - Math.abs(a - mean)));
  return { rot: mean, spread };
}

interface Shape {
  pixels: Pt[]; // filled-mask pixel centres (crop coords)
  boundary: Pt[]; // boundary pixel centres
  hull: Pt[]; // convex hull of boundary pixel corners
  area: number; // filled pixel count
}

function pca(pts: Pt[]): { cx: number; cy: number; ux: number; uy: number; l1: number; l2: number } {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of pts) {
    cx += x;
    cy += y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - cx) ** 2;
    syy += (y - cy) ** 2;
    sxy += (x - cx) * (y - cy);
  }
  sxx /= pts.length;
  syy /= pts.length;
  sxy /= pts.length;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(1e-9, tr / 2 - disc);
  let ux: number;
  let uy: number;
  if (Math.abs(sxy) > 1e-9) {
    ux = l1 - syy;
    uy = sxy;
  } else if (sxx >= syy) {
    ux = 1;
    uy = 0;
  } else {
    ux = 0;
    uy = 1;
  }
  const n = Math.hypot(ux, uy);
  return { cx, cy, ux: ux / n, uy: uy / n, l1, l2 };
}

/** Classify one filled shape. Returns shape, rotation, size, centre, confidence. */
function classify(s: Shape, cellSize: number) {
  const hullArea = Math.max(polygonArea(s.hull), 1);
  const solidity = Math.min(1, s.area / hullArea);
  const P = pca(s.pixels);
  const { cx, cy } = P;
  const elong = Math.sqrt(P.l1 / P.l2);
  const strokeHalf = 0.0125 * cellSize;
  const unit = 0.4 * cellSize;
  const radii = s.boundary.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const rMax = Math.max(...radii) + 0.5;
  const rMin = Math.min(...radii) + 0.5;
  const circumSize = () => Math.max(0, rMax - strokeHalf) / unit;
  // Extent along the principal axes (oriented bounding box).
  let tmin = Infinity;
  let tmax = -Infinity;
  let smin = Infinity;
  let smax = -Infinity;
  for (const [x, y] of s.pixels) {
    const t = (x - cx) * P.ux + (y - cy) * P.uy;
    const sv = -(x - cx) * P.uy + (y - cy) * P.ux;
    if (t < tmin) tmin = t;
    if (t > tmax) tmax = t;
    if (sv < smin) smin = sv;
    if (sv > smax) smax = sv;
  }
  tmin -= 0.5;
  tmax += 0.5;
  const ocx = cx + P.ux * (tmin + tmax) / 2 - P.uy * (smin + smax) / 2;
  const ocy = cy + P.uy * (tmin + tmax) / 2 + P.ux * (smin + smax) / 2;

  if (rMax < Math.max(8, 0.075 * cellSize) && solidity > 0.8 && elong < 1.6) {
    return { shape: "circle", rot: 0, size: circumSize(), x: cx, y: cy, conf: 0.8 };
  }
  if (elong > 4) {
    const rot = quantize(angleCwFromUp(P.ux, P.uy) % 180, 15, 180);
    return { shape: "line", rot, size: (tmax - tmin) / 2 / unit, x: ocx, y: ocy, conf: 0.9 };
  }
  const hullPerim = perimeter(s.hull);
  const approx = approxClosed(s.hull, 0.04 * hullPerim);
  const nh = approx.length;

  if (solidity < 0.9) {
    if (solidity < 0.64) {
      const outer = approxClosed(s.hull, 0.06 * hullPerim);
      const { rot } = polygonRotation(outer, cx, cy, 72);
      return { shape: "star", rot: quantize(rot, 3, 72), size: circumSize(), x: cx, y: cy, conf: outer.length === 5 ? 0.9 : 0.6 };
    }
    const fine = approxClosed(s.hull, 0.02 * hullPerim);
    if (fine.length >= 7) {
      const dmax = Math.max(...fine.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      const outer = fine.filter(([x, y]) => Math.hypot(x - cx, y - cy) > 0.8 * dmax);
      let { rot } = polygonRotation(outer, cx, cy, 90);
      if (Math.min(rot, 90 - rot) <= 7) rot = 0;
      return { shape: "cross", rot: quantize(rot, 15, 90), size: (rMax / 1.044 - strokeHalf) / unit, x: cx, y: cy, conf: fine.length >= 7 ? 0.85 : 0.6 };
    }
    // Arrow: points along the long axis towards the wider head.
    const mid = (tmin + tmax) / 2;
    let wLo = 0;
    let wHi = 0;
    for (const [x, y] of s.pixels) {
      const t = (x - cx) * P.ux + (y - cy) * P.uy;
      const sv = Math.abs(-(x - cx) * P.uy + (y - cy) * P.ux);
      if (t < mid) wLo = Math.max(wLo, sv);
      else wHi = Math.max(wHi, sv);
    }
    const sign = wHi > wLo ? 1 : -1;
    const conf = Math.max(0.3, Math.min(1, (Math.abs(wHi - wLo) / Math.max(wHi, wLo, 1)) * 2.5)) * (nh >= 4 && nh <= 6 ? 1 : 0.7);
    const dir = angleCwFromUp(sign * P.ux, sign * P.uy);
    return { shape: "arrow", rot: quantize(dir, 15, 360), size: ((tmax - tmin) / 2 - strokeHalf) / unit, x: ocx, y: ocy, conf };
  }

  const roundness = rMin / rMax;
  if (roundness > 0.915 || (roundness > 0.88 && nh >= 7)) {
    return { shape: "circle", rot: 0, size: circumSize(), x: cx, y: cy, conf: Math.min(1, 0.5 + (roundness - 0.85) * 5) };
  }
  if (nh === 3) {
    const { rot, spread } = polygonRotation(approx, cx, cy, 120);
    return { shape: "triangle", rot: quantize(rot, 15, 120), size: circumSize(), x: cx, y: cy, conf: spread < 10 ? 0.95 : 0.7 };
  }
  if (nh === 4) {
    const { rot } = polygonRotation(approx, cx, cy, 90);
    if (Math.min(Math.abs(rot - 45), 90 - Math.abs(rot - 45)) <= 22.5) {
      return { shape: "square", rot: quantize((rot - 45 + 90) % 90, 15, 90), size: circumSize(), x: cx, y: cy, conf: 0.95 };
    }
    return { shape: "diamond", rot: Math.min(rot, 90 - rot) > 7 ? quantize(rot % 90, 15, 90) : 0, size: circumSize(), x: cx, y: cy, conf: 0.95 };
  }
  if (nh === 5) {
    const { rot } = polygonRotation(approx, cx, cy, 72);
    return { shape: "pentagon", rot: quantize(rot, 3, 72), size: circumSize(), x: cx, y: cy, conf: 0.85 };
  }
  if (nh === 6) {
    const { rot } = polygonRotation(approx, cx, cy, 60);
    return { shape: "hexagon", rot: quantize(rot, 3, 60), size: circumSize(), x: cx, y: cy, conf: 0.85 };
  }
  if (roundness > 0.85) return { shape: "circle", rot: 0, size: circumSize(), x: cx, y: cy, conf: 0.6 };
  return { shape: "unknown", rot: 0, size: circumSize(), x: cx, y: cy, conf: 0.2 };
}

/** Segment objects inside a cell box (processed-image coordinates). */
/** Count background regions enclosed by one component (4-connected), capped at `cap`. */
function countHoles(local: Uint8Array, outside: Uint8Array, bw: number, bh: number, cap: number, minPx: number): number {
  const seen = new Uint8Array(bw * bh);
  let holes = 0;
  for (let i = 0; i < bw * bh; i++) {
    if (local[i] || outside[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let n = 0;
    while (stack.length) {
      const p = stack.pop()!;
      n++;
      const px = p % bw;
      const py = (p - px) / bw;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const q = ny * bw + nx;
        if (!seen[q] && !local[q] && !outside[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    // Ignore specks from compression noise.
    if (n >= minPx && ++holes >= cap) return holes;
  }
  return holes;
}

/**
 * Line-pattern (texture) cells, e.g. families of thin parallel lines or a
 * cross-hatched mesh, cannot be described as a few shapes. They are flagged so
 * the pipeline reports "unsupported" instead of misreading them as objects.
 */
export function extractObjects(
  g: Gray,
  box: { x: number; y: number; w: number; h: number },
): { objects: JsObject[]; quality: number; texture: boolean; wire?: boolean; nested?: boolean } {
  const size = Math.min(box.w, box.h);
  const inset = Math.max(3, Math.round(0.04 * size));
  const x0 = box.x + inset;
  const y0 = box.y + inset;
  const cw = box.w - 2 * inset;
  const ch = box.h - 2 * inset;
  if (cw <= 2 || ch <= 2) return { objects: [], quality: 0, texture: false };
  const crop = new Uint8Array(cw * ch);
  let lo = 255;
  let hi = 0;
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const v = g.d[(y0 + y) * g.w + x0 + x];
      crop[y * cw + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  if (hi - lo < 40) return { objects: [], quality: 1, texture: false };
  const t = otsu(crop);
  const ink = new Uint8Array(cw * ch);
  for (let i = 0; i < ink.length; i++) ink[i] = crop[i] <= t ? 1 : 0;
  const { labels, comps } = label(ink, cw, ch, 1, 8);
  const minArea = 0.0015 * size * size;
  const objects: JsObject[] = [];
  let meshes = 0;
  let wires = 0;
  for (const c of comps) {
    // Filled mask of this component (component + enclosed holes).
    const bw = c.maxx - c.minx + 3;
    const bh = c.maxy - c.miny + 3;
    const local = new Uint8Array(bw * bh); // 1 = component
    for (let y = c.miny; y <= c.maxy; y++)
      for (let x = c.minx; x <= c.maxx; x++) if (labels[y * cw + x] === c.label) local[(y - c.miny + 1) * bw + (x - c.minx + 1)] = 1;
    const outside = new Uint8Array(bw * bh);
    const stack: number[] = [0];
    outside[0] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % bw;
      const py = (p - px) / bw;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const q = ny * bw + nx;
        if (!outside[q] && !local[q]) {
          outside[q] = 1;
          stack.push(q);
        }
      }
    }
    const pixels: Pt[] = [];
    const boundary: Pt[] = [];
    const corners: Pt[] = [];
    const filled = (lx: number, ly: number) => lx >= 0 && ly >= 0 && lx < bw && ly < bh && !outside[ly * bw + lx];
    for (let ly = 0; ly < bh; ly++)
      for (let lx = 0; lx < bw; lx++) {
        if (!filled(lx, ly)) continue;
        const x = lx - 1 + c.minx;
        const y = ly - 1 + c.miny;
        pixels.push([x + 0.5, y + 0.5]);
        if (!filled(lx - 1, ly) || !filled(lx + 1, ly) || !filled(lx, ly - 1) || !filled(lx, ly + 1)) {
          boundary.push([x + 0.5, y + 0.5]);
          corners.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
        }
      }
    const area = pixels.length;
    if (area < minArea) continue;
    const holes = countHoles(local, outside, bw, bh, 4, Math.max(4, 0.0006 * size * size));
    if (holes >= 4) meshes++;
    // Thin open stroke spanning much of the cell (lines-and-dots puzzles); ordinary shapes are closed or solid.
    const bbw0 = c.maxx - c.minx + 1;
    const bbh0 = c.maxy - c.miny + 1;
    const touches0 = c.minx <= 0 || c.miny <= 0 || c.maxx >= cw - 1 || c.maxy >= ch - 1;
    if (!holes && !touches0 && Math.max(bbw0, bbh0) > 0.35 * size && c.count / (bbw0 + bbh0) < 0.04 * size) wires++;
    const bbw = c.maxx - c.minx + 1;
    const bbh = c.maxy - c.miny + 1;
    const touches = c.minx <= 0 || c.miny <= 0 || c.maxx >= cw - 1 || c.maxy >= ch - 1;
    if (touches && (bbw > 0.8 * cw || bbh > 0.8 * ch) && area < 0.1 * cw * ch) continue; // border remnant
    const hull = convexHull(corners);
    const k = classify({ pixels, boundary, hull, area }, size);
    // Fill: ink ratio in the eroded interior (chessboard distance > k).
    let fill = 1;
    if (k.shape !== "line") {
      const kk = Math.max(2, Math.round(0.035 * size));
      const dist = new Int32Array(bw * bh);
      const INF = 1 << 20;
      for (let i = 0; i < bw * bh; i++) dist[i] = outside[i] ? 0 : INF;
      for (let ly = 0; ly < bh; ly++)
        for (let lx = 0; lx < bw; lx++) {
          const i = ly * bw + lx;
          if (!dist[i]) continue;
          let m = dist[i];
          for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0]]) {
            const nx = lx + dx;
            const ny = ly + dy;
            m = Math.min(m, nx < 0 || ny < 0 || nx >= bw ? 1 : dist[ny * bw + nx] + 1);
          }
          dist[i] = m;
        }
      for (let ly = bh - 1; ly >= 0; ly--)
        for (let lx = bw - 1; lx >= 0; lx--) {
          const i = ly * bw + lx;
          if (!dist[i]) continue;
          let m = dist[i];
          for (const [dx, dy] of [[1, 1], [0, 1], [-1, 1], [1, 0]]) {
            const nx = lx + dx;
            const ny = ly + dy;
            m = Math.min(m, nx < 0 || ny >= bh || nx >= bw ? 1 : dist[ny * bw + nx] + 1);
          }
          dist[i] = m;
        }
      let n = 0;
      let dark = 0;
      for (let ly = 0; ly < bh; ly++)
        for (let lx = 0; lx < bw; lx++) {
          if (dist[ly * bw + lx] > kk) {
            n++;
            const x = lx - 1 + c.minx;
            const y = ly - 1 + c.miny;
            if (x >= 0 && y >= 0 && x < cw && y < ch && ink[y * cw + x]) dark++;
          }
        }
      if (n >= 12) {
        const r = dark / n;
        fill = r < 0.25 ? 0 : r > 0.75 ? 1 : 0.5;
      }
    }
    const period = PERIOD[k.shape] ?? 0;
    objects.push({
      shape: k.shape,
      fill,
      size: k.size,
      rotation: period ? ((k.rot % period) + period) % period : 0,
      x: (k.x + inset) / box.w,
      y: (k.y + inset) / box.h,
      confidence: k.conf,
      bbox: [c.minx + inset, c.miny + inset, bbw, bbh],
    });
  }
  let quality = objects.length ? objects.reduce((s, o) => s + o.confidence, 0) / objects.length : 1;
  if (objects.some((o) => o.shape === "unknown")) quality *= 0.5;
  // A large figure enclosing others (small shapes moving inside a big disc).
  const big = comps.filter((c) => c.count >= minArea && c.maxx - c.minx > 0.6 * size && c.maxy - c.miny > 0.6 * size && c.minx > 0 && c.miny > 0 && c.maxx < cw - 1 && c.maxy < ch - 1);
  const nested = big.some((b) => comps.some((o) => o !== b && o.count >= minArea && o.minx > b.minx && o.miny > b.miny && o.maxx < b.maxx && o.maxy < b.maxy));
  // Mid-grey filled figures (e.g. squares of a rolling-block figure): ordinary
  // shapes are black, white or half-filled.
  let grey = false;
  for (const c of comps) {
    if (c.count < 4 * minArea) continue;
    // Median grey level of the figure, relative to the cell's darkest and
    // lightest level (images are contrast-stretched); outlines stay dark.
    const vals: number[] = [];
    for (let y = c.miny; y <= c.maxy; y++) for (let x = c.minx; x <= c.maxx; x++) if (labels[y * cw + x] === c.label) vals.push(crop[y * cw + x]);
    vals.sort((a, b) => a - b);
    const rel = (vals[vals.length >> 1] - lo) / Math.max(1, hi - lo);
    // Only filled figures count: blurred outlines can look grey but cover little of their box.
    const solidity = c.count / ((c.maxx - c.minx + 1) * (c.maxy - c.miny + 1));
    if (rel > 0.2 && rel < 0.8 && solidity > 0.5) grey = true;
  }
  // Figures wider or taller than ordinary shapes ever get (e.g. long lines through a shape).
  const oversized = comps.some((c) => {
    if (c.count < minArea) return false;
    const w = c.maxx - c.minx + 1;
    const h = c.maxy - c.miny + 1;
    const touches = c.minx <= 0 || c.miny <= 0 || c.maxx >= cw - 1 || c.maxy >= ch - 1;
    return !touches && (w > 0.8 * size || h > 0.8 * size);
  });
  const thinLines = objects.filter((o) => o.shape === "line").length;
  const texture = meshes > 0 || thinLines >= 4;
  return { objects, quality, texture, wire: wires > 0, nested: nested || grey || oversized };
}
