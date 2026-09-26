/**
 * Small raster toolkit used by the in-browser vision pipeline (no OpenCV):
 * grayscale, resampling, thresholds, connected components, convex hull and
 * polygon simplification.
 */
export interface Gray {
  w: number;
  h: number;
  d: Uint8Array;
}

export function toGray(rgba: ArrayLike<number>, w: number, h: number): Gray {
  const d = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const a = rgba[j + 3] / 255;
    // Composite transparent pixels on white.
    const r = rgba[j] * a + 255 * (1 - a);
    const g = rgba[j + 1] * a + 255 * (1 - a);
    const b = rgba[j + 2] * a + 255 * (1 - a);
    d[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { w, h, d };
}

/** Area-average downscale or bilinear upscale. */
export function resize(src: Gray, nw: number, nh: number): Gray {
  const { w, h, d } = src;
  const out = new Uint8Array(nw * nh);
  if (nw <= w && nh <= h) {
    const I = integral(src);
    const sx = w / nw;
    const sy = h / nh;
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        out[y * nw + x] = Math.round(rectSum(I, w, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0)));
      }
    }
  } else {
    for (let y = 0; y < nh; y++) {
      const fy = Math.min(h - 1, Math.max(0, ((y + 0.5) * h) / nh - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(h - 1, y0 + 1);
      const ty = fy - y0;
      for (let x = 0; x < nw; x++) {
        const fx = Math.min(w - 1, Math.max(0, ((x + 0.5) * w) / nw - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(w - 1, x0 + 1);
        const tx = fx - x0;
        const a = d[y0 * w + x0] * (1 - tx) + d[y0 * w + x1] * tx;
        const b = d[y1 * w + x0] * (1 - tx) + d[y1 * w + x1] * tx;
        out[y * nw + x] = Math.round(a * (1 - ty) + b * ty);
      }
    }
  }
  return { w: nw, h: nh, d: out };
}

/** Summed-area table with a zero row/column: size (w+1)*(h+1). */
export function integral(g: Gray): Float64Array {
  const { w, h, d } = g;
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += d[y * w + x];
      I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
    }
  }
  return I;
}

export function rectSum(I: Float64Array, w: number, x0: number, y0: number, x1: number, y1: number): number {
  const W = w + 1;
  return I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
}

/** Stretch intensities to 0..255 (1st..99th percentile). */
export function normalize(g: Gray): Gray {
  const hist = new Uint32Array(256);
  for (const v of g.d) hist[v]++;
  const n = g.d.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < n * 0.005; lo++);
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < n * 0.005; hi--);
  if (hi - lo < 10) return g;
  const out = new Uint8Array(n);
  const s = 255 / (hi - lo);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round((g.d[i] - lo) * s)));
  return { w: g.w, h: g.h, d: out };
}

/** Adaptive mean threshold: 1 = ink (darker than local mean - C). */
export function adaptiveInk(g: Gray, block: number, C: number): Uint8Array {
  const { w, h, d } = g;
  const I = integral(g);
  const r = block >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const mean = rectSum(I, w, x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = d[y * w + x] < mean - C ? 1 : 0;
    }
  }
  return out;
}

export function otsu(values: ArrayLike<number>): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < values.length; i++) hist[values[i]]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

export interface Component {
  label: number;
  count: number;
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
  touchesBorder: boolean;
}

/** Label pixels where mask[i] === value. conn = 4 or 8. */
export function label(mask: Uint8Array, w: number, h: number, value: number, conn: 4 | 8): { labels: Int32Array; comps: Component[] } {
  const labels = new Int32Array(w * h).fill(-1);
  const comps: Component[] = [];
  const stack = new Int32Array(w * h);
  const nb4 = [-1, 1, -w, w];
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== value || labels[start] !== -1) continue;
    const id = comps.length;
    const c: Component = { label: id, count: 0, minx: w, miny: h, maxx: 0, maxy: 0, touchesBorder: false };
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      c.count++;
      if (x < c.minx) c.minx = x;
      if (x > c.maxx) c.maxx = x;
      if (y < c.miny) c.miny = y;
      if (y > c.maxy) c.maxy = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) c.touchesBorder = true;
      for (let k = 0; k < 4; k++) {
        const q = p + nb4[k];
        if ((k === 0 && x === 0) || (k === 1 && x === w - 1) || (k === 2 && y === 0) || (k === 3 && y === h - 1)) continue;
        if (mask[q] === value && labels[q] === -1) {
          labels[q] = id;
          stack[sp++] = q;
        }
      }
      if (conn === 8) {
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] === value && labels[q] === -1) {
            labels[q] = id;
            stack[sp++] = q;
          }
        }
      }
    }
    comps.push(c);
  }
  return { labels, comps };
}

export type Pt = [number, number];

/** Monotone-chain convex hull (counter-clockwise, no repeated end point). */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function polygonArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function perimeter(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += Math.hypot(x2 - x1, y2 - y1);
  }
  return s;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = dx * dx + dy * dy;
  if (!L) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function dp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  let idx = 0;
  let dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], pts[0], pts[pts.length - 1]);
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
  const a = dp(pts.slice(0, idx + 1), eps);
  const b = dp(pts.slice(idx), eps);
  return a.slice(0, -1).concat(b);
}

/** Douglas–Peucker for a closed polygon (like cv.approxPolyDP closed=true). */
export function approxClosed(poly: Pt[], eps: number): Pt[] {
  if (poly.length < 4) return poly;
  // Split at the two mutually farthest vertices.
  let i0 = 0;
  let far = 0;
  for (let i = 1; i < poly.length; i++) {
    const d = Math.hypot(poly[i][0] - poly[0][0], poly[i][1] - poly[0][1]);
    if (d > far) {
      far = d;
      i0 = i;
    }
  }
  let i1 = 0;
  far = 0;
  for (let i = 0; i < poly.length; i++) {
    const d = Math.hypot(poly[i][0] - poly[i0][0], poly[i][1] - poly[i0][1]);
    if (d > far) {
      far = d;
      i1 = i;
    }
  }
  const [s, e] = i0 < i1 ? [i0, i1] : [i1, i0];
  const chainA = poly.slice(s, e + 1);
  const chainB = poly.slice(e).concat(poly.slice(0, s + 1));
  const a = dp(chainA, eps);
  const b = dp(chainB, eps);
  const out = a.slice(0, -1).concat(b.slice(0, -1));
  // The split points are always kept by DP even when they lie on an edge;
  // drop any vertex that sits within eps of the line through its neighbours.
  for (let changed = true; changed && out.length > 3; ) {
    changed = false;
    let bi = -1;
    let bd = Infinity;
    for (let i = 0; i < out.length; i++) {
      const d = distToSegment(out[i], out[(i - 1 + out.length) % out.length], out[(i + 1) % out.length]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    if (bd <= eps) {
      out.splice(bi, 1);
      changed = true;
    }
  }
  return out;
}
