import type { Cell, MatrixProblem } from "../matrigma/types";
import type { ExplainedRule } from "./types";

/**
 * "Rolling block" rule for figures built from unit squares (polyominoes):
 * along each row (or column) one square rolls a fixed number of steps
 * clockwise (or counter-clockwise) around the rest of the figure, which stays
 * the same. The positions a square can roll through are the empty cells that
 * share an edge with the fixed part, in the order met when walking around its
 * outline clockwise.
 */

export type Pt = [number, number]; // [x, y], y grows downwards

const key = (p: Pt) => `${p[0]},${p[1]}`;

export function normalize(cells: Pt[]): Pt[] {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my] as Pt).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** Translation-invariant identity of a figure. */
export function shapeKey(cells: Pt[]): string {
  return cells.length ? normalize(cells).map(key).join(";") : "";
}

/** Empty cells edge-adjacent to `base`, in clockwise order around its outline. */
export function rollPositions(base: Pt[]): Pt[] {
  const inBase = new Set(base.map(key));
  type Edge = { from: string; to: string; out: Pt };
  const edges: Edge[] = [];
  for (const [x, y] of base) {
    if (!inBase.has(key([x, y - 1]))) edges.push({ from: key([x, y]), to: key([x + 1, y]), out: [x, y - 1] });
    if (!inBase.has(key([x + 1, y]))) edges.push({ from: key([x + 1, y]), to: key([x + 1, y + 1]), out: [x + 1, y] });
    if (!inBase.has(key([x, y + 1]))) edges.push({ from: key([x + 1, y + 1]), to: key([x, y + 1]), out: [x, y + 1] });
    if (!inBase.has(key([x - 1, y]))) edges.push({ from: key([x, y + 1]), to: key([x, y]), out: [x - 1, y] });
  }
  if (!edges.length) return [];
  // Start at the top edge of the top-left square so the order is canonical.
  const start = edges
    .filter((e) => e.out[1] < Number(e.from.split(",")[1]))
    .sort((a, b) => a.out[1] - b.out[1] || a.out[0] - b.out[0])[0];
  const byFrom = new Map<string, Edge[]>();
  for (const e of edges) byFrom.set(e.from, [...(byFrom.get(e.from) ?? []), e]);
  const out: Pt[] = [];
  const seen = new Set<string>();
  let e: Edge | undefined = start;
  for (let guard = 0; e && guard < edges.length; guard++) {
    if (!seen.has(key(e.out))) {
      seen.add(key(e.out));
      out.push(e.out);
    }
    const next: Edge[] = byFrom.get(e.to) ?? [];
    e = next[0];
    if (e === start) break;
  }
  return out;
}

interface Decomp {
  base: Pt[]; // normalized
  baseKey: string;
  index: number; // position of the rolling square in rollPositions(base)
  n: number;
}

/** All ways to see a figure as "fixed part + one rolling square". */
function decompositions(cells: Pt[]): Decomp[] {
  const out: Decomp[] = [];
  for (let i = 0; i < cells.length; i++) {
    const rest = cells.filter((_, j) => j !== i);
    if (!rest.length) continue;
    const mx = Math.min(...rest.map((c) => c[0]));
    const my = Math.min(...rest.map((c) => c[1]));
    const base = normalize(rest);
    const mover: Pt = [cells[i][0] - mx, cells[i][1] - my];
    const pos = rollPositions(base);
    const index = pos.findIndex((p) => p[0] === mover[0] && p[1] === mover[1]);
    if (index < 0) continue;
    out.push({ base, baseKey: shapeKey(base), index, n: pos.length });
  }
  return out;
}

const STEPS = [1, -1, 2, -2];
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Steps s for which A → B → C is one square rolling s positions each time. */
function lineSteps(a: Pt[], b: Pt[], c: Pt[]): Set<number> {
  const out = new Set<number>();
  const da = decompositions(a);
  const db = decompositions(b);
  const dc = decompositions(c);
  for (const x of da)
    for (const y of db) {
      if (x.baseKey !== y.baseKey) continue;
      for (const s of STEPS) {
        if (Math.abs(s) * 2 >= x.n) continue;
        if (mod(x.index + s, x.n) !== y.index) continue;
        if (dc.some((z) => z.baseKey === x.baseKey && z.index === mod(y.index + s, x.n))) out.add(s);
      }
    }
  return out;
}

/** Predicted figures (shape keys) for C given A, B and step s. */
function predict(a: Pt[], b: Pt[], s: number): Map<string, Pt[]> {
  const out = new Map<string, Pt[]>();
  for (const x of decompositions(a))
    for (const y of decompositions(b)) {
      if (x.baseKey !== y.baseKey || Math.abs(s) * 2 >= x.n || mod(x.index + s, x.n) !== y.index) continue;
      const pos = rollPositions(x.base);
      const m = pos[mod(y.index + s, x.n)];
      const fig = [...x.base, m];
      out.set(shapeKey(fig), fig);
    }
  return out;
}

function where(base: Pt[], m: Pt): string {
  const xs = base.map((p) => p[0]);
  const ys = base.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const v = m[1] < cy ? "top" : m[1] > cy ? "bottom" : "";
  const h = m[0] < cx ? "left" : m[0] > cx ? "right" : "";
  return v || h ? `at the ${[v, h].filter(Boolean).join(" ")} of` : "in the middle of";
}

export interface RollingRule {
  axis: "row" | "col";
  step: number;
  optionScores: number[];
  predicted: Pt[] | null;
  validated: { label: string; ok: boolean }[];
  explained: ExplainedRule;
}

const blocks = (c: Cell | null): Pt[] | null => (c?.blocks?.length ? (c.blocks as Pt[]) : null);

export function fitRolling(problem: MatrixProblem, missing: number): RollingRule[] {
  if (problem.rows !== 3 || problem.cols !== 3) return [];
  const out: RollingRule[] = [];
  for (const axis of ["row", "col"] as const) {
    const line = (i: number) => [0, 1, 2].map((k) => (axis === "row" ? i * 3 + k : k * 3 + i));
    const target = [0, 1, 2].find((i) => line(i).includes(missing))!;
    const tl = line(target);
    if (tl.indexOf(missing) !== 2) continue;
    let steps = null as Set<number> | null;
    const validated: { label: string; ok: boolean }[] = [];
    let ok = true;
    for (let i = 0; i < 3 && ok; i++) {
      if (i === target) continue;
      const figs = line(i).map((j) => blocks(problem.cells[j]));
      if (figs.some((f) => !f)) {
        ok = false;
        break;
      }
      const s = lineSteps(figs[0]!, figs[1]!, figs[2]!);
      steps = steps ? new Set([...steps].filter((x) => s.has(x))) : s;
      validated.push({ label: `${axis === "row" ? "Row" : "Column"} ${i + 1}`, ok: s.size > 0 });
      if (!s.size) ok = false;
    }
    if (!ok || !steps || !steps.size) continue;
    const a = blocks(problem.cells[tl[0]]);
    const b = blocks(problem.cells[tl[1]]);
    if (!a || !b) continue;
    for (const step of steps) {
      const preds = predict(a, b, step);
      if (!preds.size) continue;
      const keys = new Set(preds.keys());
      const optionScores = problem.options.map((o) => {
        const f = blocks(o);
        return f && keys.has(shapeKey(f)) ? 1 : 0;
      });
      const [predicted] = [...preds.values()];
      const base = decompositions(predicted).find((d) => decompositions(a).some((x) => x.baseKey === d.baseKey));
      const moverText = base ? where(base.base, rollPositions(base.base)[base.index]) : "";
      const dir = step > 0 ? "clockwise" : "counter-clockwise";
      const n = Math.abs(step);
      out.push({
        axis,
        step,
        optionScores,
        predicted: preds.size === 1 ? predicted : null,
        validated,
        explained: {
          text: `In each ${axis === "row" ? "row" : "column"} one square rolls ${n === 1 ? "one step" : `${n} steps`} ${dir} around the rest of the figure, which stays the same.`,
          attribute: "cell",
          kind: "rolling",
          axis,
          complexity: 2 + n * 0.25,
          validation: validated,
          prediction: `${axis === "row" ? "Row" : "Column"} ${target + 1}: the rolling square ends up ${moverText} the figure`,
          informative: true,
        },
      });
    }
  }
  return out;
}
