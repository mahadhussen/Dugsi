import type { Cell, Difficulty, GeneratedMatrixQuestion, MatrigmaCategory, RuleDescriptor } from "./types";
import type { Glyph, GlyphKind, GlyphValue } from "./glyphs";
import { Rng } from "./rng";
import { solveMatrix } from "../solver/solve";

/**
 * Generators for glyph-based question types and "overlay in any position".
 * Each question is kept only if the solver independently finds the intended
 * answer without ambiguity.
 */

export type Finish = (
  seed: number,
  category: MatrigmaCategory,
  difficulty: Difficulty,
  grid: Cell[],
  distractors: Cell[],
  rules: RuleDescriptor[],
  rng: Rng,
) => GeneratedMatrixQuestion | null;

const glyph = (kind: GlyphKind, props: Record<string, GlyphValue>): Cell => ({ objects: [], glyph: { kind, props } as Glyph });
const mod = (a: number, n: number) => ((a % n) + n) % n;

function verified(q: GeneratedMatrixQuestion | null): GeneratedMatrixQuestion | null {
  if (!q) return null;
  const s = solveMatrix(q.problem);
  return s.status === "solved" && s.answer === q.correctAnswer ? q : null;
}

/** Latin square over three values: row r, column c. */
function latin<T>(rng: Rng, values: T[]): (r: number, c: number) => T {
  const p = rng.shuffle(values);
  const shift = rng.pick([1, 2]);
  return (r, c) => p[(c + shift * r) % 3];
}

// ---------------------------------------------------------------------------
// Overlay in any position: in each row one cell (anywhere) is the other two
// laid on top of each other (line families and dots).

export function generateHatch(seed: number, difficulty: Difficulty, rng: Rng, finish: Finish) {
  const withDots = difficulty === "hard" || difficulty === "expert";
  const grid: Cell[] = [];
  const unionPos: number[] = [];
  const LINES = ["v", "h", "d", "a"];
  const DOTS = ["tl", "tr", "bl", "br"];
  const seen = new Set<string>();
  for (let r = 0; r < 3; r++) {
    const [a, b] = rng.sample(LINES, 2);
    const key = [a, b].sort().join();
    if (seen.has(key)) return null;
    seen.add(key);
    const ds = rng.shuffle(DOTS);
    const da = withDots ? ds.slice(0, rng.int(1, 2)) : [];
    const db = withDots ? ds.slice(2, 2 + rng.int(1, 2)) : [];
    const parts = [
      { lines: [a], dots: da },
      { lines: [b], dots: db },
      { lines: [a, b], dots: [...da, ...db] },
    ];
    const u = difficulty === "easy" ? 2 : rng.int(0, 2);
    unionPos.push(u);
    const order = u === 2 ? [0, 1, 2] : u === 0 ? [2, 0, 1] : [0, 2, 1];
    for (const i of order) grid.push({ objects: [], pattern: { lines: parts[i].lines, bars: [], dots: parts[i].dots } });
  }
  if (difficulty !== "easy" && new Set(unionPos).size < 2) return null;
  const correct = grid[8].pattern!;
  const mk = (lines: string[], dots: string[]): Cell => ({ objects: [], pattern: { lines, bars: [], dots } });
  const other = (have: string[], pool: string[]) => rng.pick(pool.filter((t) => !have.includes(t)));
  const wrong = rng.shuffle([
    mk([...correct.lines, other(correct.lines, LINES)], correct.dots),
    mk(correct.lines.length > 1 ? correct.lines.slice(1) : [other(correct.lines, LINES)], correct.dots),
    mk([...grid[6].pattern!.lines, ...grid[7].pattern!.lines].filter((t, i, a) => a.indexOf(t) === i), correct.dots),
    mk(grid[6].pattern!.lines, grid[6].pattern!.dots),
    mk(grid[7].pattern!.lines, grid[7].pattern!.dots),
    ...(withDots
      ? [mk(correct.lines, [...correct.dots, other(correct.dots, DOTS)]), mk(correct.lines, correct.dots.slice(1)), mk(correct.lines, [])]
      : [mk([other([], LINES)], []), mk(LINES.slice(0, 3), [])]),
  ]);
  const rules: RuleDescriptor[] = [
    { attribute: "lines", kind: "union_any", axis: "row", description: "In each row one cell (in any position) is the other two laid on top of each other (line patterns)." },
    ...(withDots ? [{ attribute: "dots", kind: "union_any", axis: "row", description: "The dots follow the same rule: the overlay cell has the dots of both other cells." } as RuleDescriptor] : []),
  ];
  return verified(finish(seed, "hatch", difficulty, grid, wrong, rules, rng));
}

// ---------------------------------------------------------------------------
// Swap positions: the thick bar marks the symbol that stays; the others swap.

const SYMBOLS = ["up", "down", "both"];
const seqCell = (s: string[]) => glyph("seq", { p1: s[0], p2: s[1], p3: s[2] });
const barCell = (k: number) => seqCell([0, 1, 2].map((i) => (i === k ? "thick" : "thin")));
const swapExcept = (s: string[], k: number) => {
  const [i, j] = [0, 1, 2].filter((x) => x !== k);
  const o = [...s];
  [o[i], o[j]] = [s[j], s[i]];
  return o;
};
const PERMS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
].map((p) => p.map((i) => SYMBOLS[i]));

export function generateSwap(seed: number, difficulty: Difficulty, rng: Rng, finish: Finish) {
  const ks = rng.shuffle([0, 1, 2]);
  const grid: Cell[] = [];
  let answerIsBar = false;
  let rowA: string[] = [];
  for (let r = 0; r < 3; r++) {
    const k = ks[r];
    const a = rng.pick(PERMS);
    const b = swapExcept(a, k);
    const barPos = difficulty === "easy" ? 0 : rng.int(0, 2);
    const cells: Cell[] = [];
    let sym = [a, b];
    for (let c = 0; c < 3; c++) {
      if (c === barPos) cells.push(barCell(k));
      else cells.push(seqCell(sym.shift()!));
    }
    grid.push(...cells);
    if (r === 2) {
      answerIsBar = barPos === 2;
      rowA = a;
    }
  }
  // Near misses first: other bar positions, or the other orders of the same symbols.
  const bars = rng.shuffle([0, 1, 2].map(barCell));
  const perms = rng.shuffle([seqCell(rowA), ...PERMS.map(seqCell)]);
  const wrong = answerIsBar ? [...bars, ...perms] : [...perms, ...bars];
  const rules: RuleDescriptor[] = [
    { attribute: "cell", kind: "swap", axis: "row", description: "In each row the thick bar marks the position that stays the same; in the two symbol cells the other two symbols swap places." },
  ];
  return verified(finish(seed, "swap", difficulty, grid, wrong, rules, rng));
}

// ---------------------------------------------------------------------------
// Moving dots around the edge of a 3×3 grid.

export function generateDotpath(seed: number, difficulty: Difficulty, rng: Rng, finish: Finish) {
  const withWhite = difficulty !== "easy";
  const sb = difficulty === "easy" ? rng.pick([1, -1]) : rng.pick([1, -1, 2, -2]);
  let sw = rng.pick(difficulty === "medium" ? [2, -2] : [1, -1, 2, -2, 3, -3]);
  if (withWhite && sw === sb) sw = -sw;
  const grid: Cell[] = [];
  for (let r = 0; r < 3; r++) {
    const b0 = rng.int(0, 7);
    const w0 = rng.int(0, 7);
    for (let c = 0; c < 3; c++) {
      const b = mod(b0 + c * sb, 8);
      const w = mod(w0 + c * sw, 8);
      if (withWhite && b === w) return null; // keep both dots visible
      grid.push(glyph("dotpath", withWhite ? { black: b, white: w } : { black: b }));
    }
  }
  const { black, white } = grid[8].glyph!.props as { black: number; white?: number };
  const mk = (b: number, w?: number): Cell => glyph("dotpath", w === undefined ? { black: mod(b, 8) } : { black: mod(b, 8), white: mod(w, 8) });
  const wrong = rng.shuffle(
    withWhite
      ? [mk(black, white! + 1), mk(black, white! - 1), mk(black + 1, white), mk(black - 1, white), mk(white!, black), mk(black - sb, white! - sw), mk(black + sb, white! + sw), mk(black + 2, white! + 2)].filter(
          (c) => c.glyph!.props.black !== c.glyph!.props.white,
        )
      : [mk(black + 1), mk(black - 1), mk(black + 2), mk(black - 2), mk(black + 4), mk(black + 3), mk(black - 3)],
  );
  const dir = (d: number) => `${Math.abs(d)} step${Math.abs(d) === 1 ? "" : "s"} ${d > 0 ? "clockwise" : "counter-clockwise"}`;
  const rules: RuleDescriptor[] = [
    { attribute: "g:black", kind: "progression", axis: "row", description: `Along each row the black dot moves ${dir(sb)} around the edge.` },
    ...(withWhite ? [{ attribute: "g:white", kind: "progression", axis: "row", description: `The white dot moves ${dir(sw)} around the edge.` } as RuleDescriptor] : []),
  ];
  return verified(finish(seed, "dotpath", difficulty, grid, wrong, rules, rng));
}

// ---------------------------------------------------------------------------
// Circle and square moving around inside a big circle (quarter turns).

export function generateOrbit(seed: number, difficulty: Difficulty, rng: Rng, finish: Finish) {
  const sc = rng.pick([1, -1]);
  const ss = difficulty === "easy" ? 0 : difficulty === "medium" ? 2 : rng.pick([1, -1].filter((x) => x !== sc).concat([2]));
  const grid: Cell[] = [];
  for (let r = 0; r < 3; r++) {
    const c0 = rng.int(0, 3);
    const s0 = rng.int(0, 3);
    for (let c = 0; c < 3; c++) grid.push(glyph("orbit", { square: mod(s0 + c * ss, 4), circle: mod(c0 + c * sc, 4) }));
  }
  const { square, circle } = grid[8].glyph!.props as { square: number; circle: number };
  const mk = (s: number, c: number) => glyph("orbit", { square: mod(s, 4), circle: mod(c, 4) });
  const wrong = rng.shuffle([mk(square, circle + 1), mk(square, circle + 2), mk(square, circle - 1), mk(square + 1, circle), mk(square + 2, circle), mk(circle, square), mk(square - 1, circle - 1), mk(square + 1, circle + 1)]);
  const rules: RuleDescriptor[] = [
    { attribute: "g:circle", kind: "progression", axis: "row", description: `Along each row the small circle moves 90° ${sc > 0 ? "clockwise" : "counter-clockwise"} per step.` },
    {
      attribute: "g:square",
      kind: ss ? "progression" : "constant",
      axis: "row",
      description: ss === 0 ? "The square stays where it is." : ss === 2 ? "The square jumps to the opposite side each step." : `The square moves 90° ${ss > 0 ? "clockwise" : "counter-clockwise"} per step.`,
    },
  ];
  return verified(finish(seed, "orbit", difficulty, grid, wrong, rules, rng));
}

// ---------------------------------------------------------------------------
// Figure combinations: frame + inner lines and circle size, each row has each once.

const FIGURES = ["square-x", "square-plus", "diamond-plus", "diamond-x"];

export function generateEmblem(seed: number, difficulty: Difficulty, rng: Rng, finish: Finish) {
  const figs = rng.sample(FIGURES, 3);
  const unused = FIGURES.find((f) => !figs.includes(f))!;
  const fig = latin(rng, figs);
  const circ = difficulty === "easy" ? () => 2 : latin(rng, [1, 2, 3]);
  const grid: Cell[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push(glyph("emblem", { figure: fig(r, c), circle: circ(r, c) }));
  const { figure, circle } = grid[8].glyph!.props as { figure: string; circle: number };
  const mk = (f: string, c: number) => glyph("emblem", { figure: f, circle: c });
  const wrong = rng.shuffle([
    ...[1, 2, 3].filter((c) => c !== circle).map((c) => mk(figure, c)),
    ...figs.filter((f) => f !== figure).map((f) => mk(f, circle)),
    mk(unused, circle),
    mk(unused, mod(circle, 3) + 1),
  ]);
  const rules: RuleDescriptor[] = [
    { attribute: "g:figure", kind: "distribute", axis: "row", description: "Each row contains the same three figures (frame with inner lines), each once." },
    ...(difficulty === "easy" ? [] : [{ attribute: "g:circle", kind: "distribute", axis: "row", description: "Each row contains a small, a medium and a large circle, each once." } as RuleDescriptor]),
  ];
  return verified(finish(seed, "emblem", difficulty, grid, wrong, rules, rng));
}

// ---------------------------------------------------------------------------
// Shrinking (or growing) bars along one side of the cell.

export function generateStrip(seed: number, difficulty: Difficulty, rng: Rng, finish: Finish) {
  const sides = rng.sample(["top", "right", "bottom", "left"], 3);
  const grow = difficulty === "medium" || difficulty === "expert" ? rng.bool() : false;
  const grid: Cell[] = [];
  for (let r = 0; r < 3; r++) {
    const corner = rng.pick(["start", "end"]);
    for (let c = 0; c < 3; c++) grid.push(glyph("strip", { side: sides[r], length: grow ? c + 1 : 3 - c, corner }));
  }
  const { side, length, corner } = grid[8].glyph!.props as { side: string; length: number; corner: string };
  const flip = corner === "start" ? "end" : "start";
  const mk = (s: string, l: number, c: string) => glyph("strip", { side: s, length: l, corner: c });
  const otherSides = ["top", "right", "bottom", "left"].filter((s) => s !== side);
  const wrong = rng.shuffle([
    mk(side, length, flip),
    ...otherSides.map((s) => mk(s, length, corner)),
    mk(side, length === 1 ? 2 : 1, corner),
    mk(side, 2, flip),
    mk(otherSides[0], 2, flip),
  ]);
  const rules: RuleDescriptor[] = [
    { attribute: "g:length", kind: "progression", axis: "row", description: `Along each row the bar ${grow ? "grows" : "shrinks"} by one third per step.` },
    { attribute: "g:corner", kind: "constant", axis: "row", description: "It stays on the same side and keeps its corner." },
  ];
  return verified(finish(seed, "strip", difficulty, grid, wrong, rules, rng));
}

// ---------------------------------------------------------------------------
// Shapes and lines: each shape always has its own number of lines; the line
// direction is the same within a row.

export function generateLined(seed: number, difficulty: Difficulty, rng: Rng, finish: Finish) {
  const shapes = ["block", "square", "ellipse"];
  const counts = rng.shuffle([1, 2, 3]);
  const countOf = (s: string) => counts[shapes.indexOf(s)];
  const shape = latin(rng, shapes);
  const dirs = difficulty === "easy" ? ["h", "h", "h"] : rng.shuffle(["h", "v", "d"]);
  const grid: Cell[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid.push(glyph("lined", { shape: shape(r, c), count: countOf(shape(r, c)), dir: dirs[r] }));
  const { shape: s, count, dir } = grid[8].glyph!.props as { shape: string; count: number; dir: string };
  const mk = (sh: string, n: number, d: string) => glyph("lined", { shape: sh, count: n, dir: d });
  const otherDirs = ["h", "v", "d"].filter((d) => d !== dir);
  const wrong = rng.shuffle([
    ...[1, 2, 3].filter((n) => n !== count).map((n) => mk(s, n, dir)),
    ...otherDirs.map((d) => mk(s, count, d)),
    ...shapes.filter((x) => x !== s).map((x) => mk(x, countOf(x), dir)),
    mk(s, [1, 2, 3].find((n) => n !== count)!, otherDirs[0]),
  ]);
  const rules: RuleDescriptor[] = [
    { attribute: "g:shape", kind: "distribute", axis: "row", description: "Each row contains the three shapes once each, and each shape always has its own number of lines." },
    { attribute: "g:dir", kind: "constant", axis: "row", description: "Within a row all lines point the same way." },
  ];
  return verified(finish(seed, "lined", difficulty, grid, wrong, rules, rng));
}

// ---------------------------------------------------------------------------
// Texture bands: three of four textures per cell; in each row every band
// position and the left-out texture are all different.

const TEXTURES = ["black", "grid", "dots", "diag"];
type Bands = { b1: string; b2: string; b3: string; missing: string };
const bandsCell = (b: Bands) => glyph("bands", b);

function bandRowOk(row: Bands[]): boolean {
  return (["b1", "b2", "b3", "missing"] as const).every((k) => new Set(row.map((c) => c[k])).size === row.length);
}

function randomBandRow(rng: Rng): Bands[] | null {
  const missing = rng.sample(TEXTURES, 3);
  for (let t = 0; t < 60; t++) {
    const row = missing.map((m) => {
      const [b1, b2, b3] = rng.shuffle(TEXTURES.filter((x) => x !== m));
      return { b1, b2, b3, missing: m };
    });
    if (bandRowOk(row)) return row;
  }
  return null;
}

export function generateBands(seed: number, difficulty: Difficulty, rng: Rng, finish: Finish) {
  const rows: Bands[][] = [];
  for (let r = 0; r < 3; r++) {
    const row = randomBandRow(rng);
    if (!row) return null;
    rows.push(row);
  }
  const grid = rows.flat().map(bandsCell);
  const correct = rows[2][2];
  const known = [rows[2][0], rows[2][1]];
  // Distractors must break the row rule, otherwise they would also be correct.
  const all: Bands[] = TEXTURES.flatMap((m) => {
    const rest = TEXTURES.filter((x) => x !== m);
    return PERMS.map((p) => ({ b1: rest[SYMBOLS.indexOf(p[0])], b2: rest[SYMBOLS.indexOf(p[1])], b3: rest[SYMBOLS.indexOf(p[2])], missing: m }));
  });
  const wrong = rng
    .shuffle(all)
    .filter((b) => !bandRowOk([...known, b]))
    .slice(0, 12)
    .map(bandsCell);
  const rules: RuleDescriptor[] = [
    { attribute: "g:b1", kind: "alldiff", axis: "row", description: "In each row every band position (left, middle, right) shows a different texture in each cell." },
    { attribute: "g:missing", kind: "alldiff", axis: "row", description: "Each cell leaves out one of the four textures, and it is a different one in each cell of the row." },
  ];
  void correct;
  return verified(finish(seed, "bands", difficulty, grid, wrong, rules, rng));
}

// ---------------------------------------------------------------------------
// Cut-out piece: whole shape → shape with a piece cut off → the piece, fallen
// to the bottom with its tip up. Harder levels mix the order of the stages.

const CUT_SHAPES: Record<Difficulty, string[]> = {
  easy: ["square", "pentagon", "hexagon", "triangle"],
  medium: ["square", "pentagon", "hexagon", "circle"],
  hard: ["square", "pentagon", "hexagon", "triangle", "circle"],
  expert: ["square", "pentagon", "hexagon", "triangle", "circle"],
};
const CORNERS: Record<string, number> = { triangle: 3, square: 4, pentagon: 5, hexagon: 6, circle: 4 };

export function generateCutout(seed: number, difficulty: Difficulty, rng: Rng, finish: Finish) {
  const bases = rng.sample(CUT_SHAPES[difficulty], 3);
  const stages = ["whole", "cut", "piece"];
  const order = difficulty === "hard" || difficulty === "expert" ? latin(rng, stages) : (_r: number, c: number) => stages[c];
  const grid: Cell[] = [];
  const cuts: number[] = [];
  for (let r = 0; r < 3; r++) {
    const cut = rng.int(0, CORNERS[bases[r]] - 1);
    cuts.push(cut);
    for (let c = 0; c < 3; c++) grid.push(glyph("cutout", { base: bases[r], cut, stage: order(r, c) }));
  }
  const { base, cut, stage } = grid[8].glyph!.props as { base: string; cut: number; stage: string };
  const mk = (b: string, k: number, st: string) => glyph("cutout", { base: b, cut: mod(k, CORNERS[b]), stage: st });
  const others = stages.filter((x) => x !== stage);
  const wrong = rng.shuffle([
    mk(base, cut, stage === "piece" ? "inplace" : "piece"), // right piece, not fallen (or the fallen piece where the cut shape belongs)
    ...others.map((st) => mk(base, cut, st)),
    // Another corner only looks different on the cut shape; a whole shape or a
    // fallen piece looks the same whichever corner it came from.
    ...(stage === "cut" ? [mk(base, cut + 1, stage), mk(base, cut - 1, stage)] : []),
    ...bases.filter((b) => b !== base).map((b) => mk(b, 0, stage)),
  ]);
  const rules: RuleDescriptor[] = [
    { attribute: "g:base", kind: "constant", axis: "row", description: "Each row uses one shape and cuts off the same corner." },
    {
      attribute: "g:stage",
      kind: "distribute",
      axis: "row",
      description:
        difficulty === "hard" || difficulty === "expert"
          ? "Each row shows the whole shape, the shape with a piece cut off, and that piece fallen to the bottom (tip up), in varying order."
          : "Along each row: the whole shape, then the shape with a piece cut off, then that piece fallen to the bottom with its tip up.",
    },
  ];
  void cuts;
  return verified(finish(seed, "cutout", difficulty, grid, wrong, rules, rng));
}
