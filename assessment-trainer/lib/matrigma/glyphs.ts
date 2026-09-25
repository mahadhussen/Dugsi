/**
 * "Glyph" cells: small composite figures described by a few named properties
 * (e.g. { side: "top", length: 2, corner: "start" }). Each glyph kind declares
 * how its properties behave, so the rule engine can fit rules on them without
 * kind-specific code, and how the glyph is drawn.
 */

export type GlyphKind = "dotpath" | "emblem" | "strip" | "lined" | "seq" | "orbit" | "bands";
export type GlyphValue = string | number;

export interface Glyph {
  kind: GlyphKind;
  props: Record<string, GlyphValue>;
}

export interface GlyphPropSpec {
  prop: string;
  label: string;
  kind: "numeric" | "category" | "angle";
  /** Modular period for "angle" properties (positions around a cycle). */
  period?: number;
  tol: number;
  format?: (v: GlyphValue) => string;
  /** Phrase for a progression step d, e.g. "moves one step clockwise around the edge". */
  describeStep?: (d: number) => string;
  /** Allow the "all different in each row/column" rule (for properties drawn from a larger pool). */
  alldiff?: boolean;
}

const steps = (n: number, unit: string) => `${n === 1 ? "one" : n} ${unit}${n === 1 ? "" : "s"}`;
const edgeStep = (d: number) => `moves ${steps(Math.abs(Math.round(d)), "step")} ${d > 0 ? "clockwise" : "counter-clockwise"} around the edge`;
const quarterStep = (d: number) => {
  const q = Math.abs(Math.round(d));
  return q === 2 ? "jumps to the opposite side" : `moves ${q * 90}° ${d > 0 ? "clockwise" : "counter-clockwise"}`;
};
const SIDE4 = ["top", "right", "bottom", "left"];
const TEXTURE_WORDS: Record<string, string> = { black: "black", grid: "grid", dots: "dotted", diag: "striped" };

/** Positions around the edge of a 3×3 grid, clockwise from the top-left cell (grid index = row * 3 + col). */
export const EDGE_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const EDGE_WORDS = ["top-left", "top-middle", "top-right", "middle-right", "bottom-right", "bottom-middle", "bottom-left", "middle-left"];

export const GLYPH_PROPS: Record<GlyphKind, GlyphPropSpec[]> = {
  dotpath: [
    { prop: "black", label: "black dot", kind: "angle", period: 8, tol: 0.3, format: (v) => EDGE_WORDS[Number(v)] ?? String(v), describeStep: edgeStep },
    { prop: "white", label: "white dot", kind: "angle", period: 8, tol: 0.3, format: (v) => EDGE_WORDS[Number(v)] ?? String(v), describeStep: edgeStep },
  ],
  emblem: [
    { prop: "figure", label: "figure (frame and inner lines)", kind: "category", tol: 0, format: (v) => String(v).replace("square", "square").replace("-", " with ").replace("plus", "+ lines").replace(/\bx\b/, "× lines") },
    { prop: "circle", label: "circle size", kind: "numeric", tol: 0.5, format: (v) => ["", "small", "medium", "large"][Number(v)] ?? String(v) },
  ],
  strip: [
    { prop: "side", label: "side of the bar", kind: "category", tol: 0 },
    { prop: "length", label: "bar length (thirds)", kind: "numeric", tol: 0.5, format: (v) => `${v}/3` },
    { prop: "corner", label: "corner the bar shrinks towards", kind: "category", tol: 0 },
  ],
  lined: [
    { prop: "shape", label: "shape", kind: "category", tol: 0 },
    { prop: "count", label: "number of lines", kind: "numeric", tol: 0.5 },
    { prop: "dir", label: "direction of the lines", kind: "category", tol: 0, format: (v) => ({ h: "horizontal", v: "vertical", d: "diagonal" })[String(v)] ?? String(v) },
  ],
  // Sequences are handled by their own swap rule (lib/solver/swap.ts).
  seq: [],
  orbit: [
    { prop: "square", label: "square", kind: "angle", period: 4, tol: 0.3, format: (v) => SIDE4[Number(v)] ?? String(v), describeStep: quarterStep },
    { prop: "circle", label: "small circle", kind: "angle", period: 4, tol: 0.3, format: (v) => SIDE4[Number(v)] ?? String(v), describeStep: quarterStep },
  ],
  bands: [
    { prop: "b1", label: "left band", kind: "category", tol: 0, alldiff: true, format: (v) => TEXTURE_WORDS[String(v)] ?? String(v) },
    { prop: "b2", label: "middle band", kind: "category", tol: 0, alldiff: true, format: (v) => TEXTURE_WORDS[String(v)] ?? String(v) },
    { prop: "b3", label: "right band", kind: "category", tol: 0, alldiff: true, format: (v) => TEXTURE_WORDS[String(v)] ?? String(v) },
    { prop: "missing", label: "texture that is left out", kind: "category", tol: 0, alldiff: true, format: (v) => TEXTURE_WORDS[String(v)] ?? String(v) },
  ],
};

export function glyphTokens(g: Glyph): string[] {
  return Object.entries(g.props).map(([k, v]) => `g:${g.kind}:${k}=${v}`);
}

// ---------------------------------------------------------------------------
// Rendering

const INK = "#111827";
const f = (n: number) => (Math.round(n * 100) / 100).toString();

function dotpathSvg(p: Record<string, GlyphValue>, x0: number, y0: number, s: number): string {
  const m = s * 0.16;
  const w = (s - 2 * m) / 3;
  const sw = Math.max(1, s * 0.012);
  const parts: string[] = [];
  for (let i = 0; i <= 3; i++) {
    parts.push(`<line x1="${f(x0 + m + i * w)}" y1="${f(y0 + m)}" x2="${f(x0 + m + i * w)}" y2="${f(y0 + s - m)}" stroke="${INK}" stroke-width="${f(sw)}"/>`);
    parts.push(`<line x1="${f(x0 + m)}" y1="${f(y0 + m + i * w)}" x2="${f(x0 + s - m)}" y2="${f(y0 + m + i * w)}" stroke="${INK}" stroke-width="${f(sw)}"/>`);
  }
  const at = (edge: number) => {
    const idx = EDGE_ORDER[((edge % 8) + 8) % 8];
    return [x0 + m + (idx % 3) * w + w / 2, y0 + m + Math.floor(idx / 3) * w + w / 2];
  };
  if (p.white !== undefined) {
    const [x, y] = at(Number(p.white));
    parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(w * 0.32)}" fill="#ffffff" stroke="${INK}" stroke-width="${f(sw * 1.3)}"/>`);
  }
  if (p.black !== undefined) {
    const [x, y] = at(Number(p.black));
    parts.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(w * 0.34)}" fill="${INK}"/>`);
  }
  return parts.join("");
}

function emblemSvg(p: Record<string, GlyphValue>, x0: number, y0: number, s: number): string {
  const cx = x0 + s / 2;
  const cy = y0 + s / 2;
  const h = s * 0.3; // half size of the frame
  const sw = Math.max(1.5, s * 0.02);
  const [frame, lines] = String(p.figure).split("-");
  const parts: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${INK}" stroke-width="${f(sw)}"/>`;
  if (frame === "square") {
    parts.push(`<rect x="${f(cx - h)}" y="${f(cy - h)}" width="${f(2 * h)}" height="${f(2 * h)}" fill="none" stroke="${INK}" stroke-width="${f(sw)}"/>`);
    if (lines === "plus") parts.push(line(cx, cy - h, cx, cy + h), line(cx - h, cy, cx + h, cy));
    else parts.push(line(cx - h, cy - h, cx + h, cy + h), line(cx - h, cy + h, cx + h, cy - h));
  } else {
    const d = h * 1.25;
    parts.push(`<polygon points="${f(cx)},${f(cy - d)} ${f(cx + d)},${f(cy)} ${f(cx)},${f(cy + d)} ${f(cx - d)},${f(cy)}" fill="none" stroke="${INK}" stroke-width="${f(sw)}"/>`);
    if (lines === "plus") parts.push(line(cx, cy - d, cx, cy + d), line(cx - d, cy, cx + d, cy));
    else parts.push(line(cx - d / 2, cy - d / 2, cx + d / 2, cy + d / 2), line(cx - d / 2, cy + d / 2, cx + d / 2, cy - d / 2));
  }
  const r = [0, s * 0.08, s * 0.17, s * 0.44][Number(p.circle)] ?? 0;
  if (r) parts.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${r < h ? "#ffffff" : "none"}" stroke="${INK}" stroke-width="${f(sw * 0.8)}"/>`);
  return parts.join("");
}

function stripSvg(p: Record<string, GlyphValue>, x0: number, y0: number, s: number): string {
  const m = s * 0.08;
  const span = s - 2 * m;
  const thick = span * 0.3;
  const len = (span * Number(p.length)) / 3;
  const start = p.corner === "start";
  let x: number, y: number, w: number, h: number;
  switch (p.side) {
    case "top":
      [x, y, w, h] = [start ? m : m + span - len, m, len, thick];
      break;
    case "bottom":
      [x, y, w, h] = [start ? m : m + span - len, m + span - thick, len, thick];
      break;
    case "left":
      [x, y, w, h] = [m, start ? m : m + span - len, thick, len];
      break;
    default:
      [x, y, w, h] = [m + span - thick, start ? m : m + span - len, thick, len];
  }
  return `<rect x="${f(x0 + x)}" y="${f(y0 + y)}" width="${f(w)}" height="${f(h)}" fill="#6b7280" stroke="${INK}" stroke-width="${f(Math.max(1, s * 0.01))}"/>`;
}

function linedSvg(p: Record<string, GlyphValue>, x0: number, y0: number, s: number): string {
  const cx = x0 + s / 2;
  const cy = y0 + s / 2;
  const sw = Math.max(1.5, s * 0.02);
  const parts: string[] = [];
  if (p.shape === "block") parts.push(`<rect x="${f(cx - s * 0.09)}" y="${f(cy - s * 0.24)}" width="${f(s * 0.18)}" height="${f(s * 0.48)}" fill="${INK}"/>`);
  else if (p.shape === "square") parts.push(`<rect x="${f(cx - s * 0.16)}" y="${f(cy - s * 0.16)}" width="${f(s * 0.32)}" height="${f(s * 0.32)}" fill="none" stroke="${INK}" stroke-width="${f(sw)}"/>`);
  else parts.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(s * 0.27)}" ry="${f(s * 0.12)}" fill="none" stroke="${INK}" stroke-width="${f(sw)}" transform="rotate(-45 ${f(cx)} ${f(cy)})"/>`);
  const n = Number(p.count);
  const gap = s * 0.035;
  const rot = p.dir === "h" ? 0 : p.dir === "v" ? 90 : -45;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * gap;
    parts.push(`<line x1="${f(cx - s * 0.44)}" y1="${f(cy + off)}" x2="${f(cx + s * 0.44)}" y2="${f(cy + off)}" stroke="${INK}" stroke-width="${f(sw * 0.7)}" transform="rotate(${rot} ${f(cx)} ${f(cy)})"/>`);
  }
  return parts.join("");
}

function seqSvg(p: Record<string, GlyphValue>, x0: number, y0: number, s: number): string {
  const sw = Math.max(1.5, s * 0.02);
  const top = y0 + s * 0.22;
  const bot = y0 + s * 0.78;
  const head = s * 0.07;
  const parts: string[] = [];
  ["p1", "p2", "p3"].forEach((k, i) => {
    const x = x0 + s * (0.25 + 0.25 * i);
    const t = String(p[k]);
    if (t === "thick") parts.push(`<rect x="${f(x - s * 0.035)}" y="${f(top)}" width="${f(s * 0.07)}" height="${f(bot - top)}" fill="${INK}"/>`);
    else parts.push(`<line x1="${f(x)}" y1="${f(top)}" x2="${f(x)}" y2="${f(bot)}" stroke="${INK}" stroke-width="${f(sw)}"/>`);
    const up = `<polyline points="${f(x - head)},${f(top + head)} ${f(x)},${f(top)} ${f(x + head)},${f(top + head)}" fill="none" stroke="${INK}" stroke-width="${f(sw)}"/>`;
    const down = `<polyline points="${f(x - head)},${f(bot - head)} ${f(x)},${f(bot)} ${f(x + head)},${f(bot - head)}" fill="none" stroke="${INK}" stroke-width="${f(sw)}"/>`;
    if (t === "up" || t === "both") parts.push(up);
    if (t === "down" || t === "both") parts.push(down);
  });
  return parts.join("");
}

function orbitSvg(p: Record<string, GlyphValue>, x0: number, y0: number, s: number): string {
  const cx = x0 + s / 2;
  const cy = y0 + s / 2;
  const R = s * 0.42;
  const r = s * 0.27; // radius of the ring the small figures sit on
  const sw = Math.max(1, s * 0.012);
  const at = (i: number) => [cx + r * Math.sin((i * Math.PI) / 2), cy - r * Math.cos((i * Math.PI) / 2)];
  const [sx, sy] = at(Number(p.square));
  const [ox, oy] = at(Number(p.circle));
  const q = s * 0.13;
  return (
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}" fill="#cbd0d6" stroke="${INK}" stroke-width="${f(sw)}"/>` +
    `<rect x="${f(sx - q)}" y="${f(sy - q)}" width="${f(2 * q)}" height="${f(2 * q)}" fill="#ffffff" stroke="${INK}" stroke-width="${f(sw * 1.6)}"/>` +
    `<circle cx="${f(ox)}" cy="${f(oy)}" r="${f(q * 0.72)}" fill="#ffffff" stroke="${INK}" stroke-width="${f(sw * 1.3)}"/>`
  );
}

function bandsSvg(p: Record<string, GlyphValue>, x0: number, y0: number, s: number, uid: string): string {
  const m = s * 0.1;
  const w = (s - 2 * m) / 3;
  const h = s - 2 * m;
  const sw = Math.max(1, s * 0.012);
  const out: string[] = [];
  ["b1", "b2", "b3"].forEach((k, i) => {
    const x = x0 + m + i * w;
    const y = y0 + m;
    const t = String(p[k]);
    const id = `bd${uid}_${i}`;
    let fill = "";
    if (t === "black") fill = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${INK}"/>`;
    else {
      const lines: string[] = [];
      const g = s * 0.045;
      if (t === "grid") {
        for (let a = x + g; a < x + w; a += g) lines.push(`M${f(a)} ${f(y)}V${f(y + h)}`);
        for (let b = y + g; b < y + h; b += g) lines.push(`M${f(x)} ${f(b)}H${f(x + w)}`);
      } else if (t === "diag") {
        for (let k2 = -h; k2 < w + h; k2 += g) lines.push(`M${f(x + k2)} ${f(y + h)}L${f(x + k2 + h)} ${f(y)}`);
      }
      const dots: string[] = [];
      if (t === "dots") for (let a = x + g / 2; a < x + w; a += g) for (let b = y + g / 2; b < y + h; b += g) dots.push(`<circle cx="${f(a)}" cy="${f(b)}" r="${f(Math.max(0.6, s * 0.006))}" fill="${INK}"/>`);
      fill = `<defs><clipPath id="${id}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"/></clipPath></defs><g clip-path="url(#${id})">${lines.length ? `<path d="${lines.join("")}" stroke="${INK}" stroke-width="${f(t === "diag" ? sw * 1.8 : sw)}" fill="none"/>` : ""}${dots.join("")}</g>`;
    }
    out.push(fill, `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="none" stroke="${INK}" stroke-width="${f(sw * 1.5)}"/>`);
  });
  return out.join("");
}

export function glyphSvg(g: Glyph, x0: number, y0: number, size: number, uid = "g"): string {
  switch (g.kind) {
    case "dotpath":
      return dotpathSvg(g.props, x0, y0, size);
    case "emblem":
      return emblemSvg(g.props, x0, y0, size);
    case "strip":
      return stripSvg(g.props, x0, y0, size);
    case "lined":
      return linedSvg(g.props, x0, y0, size);
    case "seq":
      return seqSvg(g.props, x0, y0, size);
    case "orbit":
      return orbitSvg(g.props, x0, y0, size);
    case "bands":
      return bandsSvg(g.props, x0, y0, size, uid);
  }
}
