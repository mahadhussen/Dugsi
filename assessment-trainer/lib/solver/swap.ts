import type { Cell, MatrixProblem } from "../matrigma/types";
import type { ExplainedRule } from "./types";

/**
 * "Swap" rule for rows of three-symbol sequences: in each row one cell shows
 * bars where the thick bar marks a position; in the two symbol cells the
 * symbol at that position stays put and the other two swap places.
 */

type Seq = string[];
const seqOf = (c: Cell | null): Seq | null => (c?.glyph?.kind === "seq" ? ["p1", "p2", "p3"].map((k) => String(c.glyph!.props[k])) : null);
const isBars = (s: Seq) => s.every((t) => t === "thin" || t === "thick") && s.filter((t) => t === "thick").length === 1;
const swapExcept = (s: Seq, k: number): Seq => {
  const [i, j] = [0, 1, 2].filter((x) => x !== k);
  const out = [...s];
  [out[i], out[j]] = [s[j], s[i]];
  return out;
};
const same = (a: Seq, b: Seq) => a.every((t, i) => t === b[i]);

function lineHolds(line: Seq[]): boolean {
  const bars = line.filter(isBars);
  const syms = line.filter((s) => !isBars(s));
  if (bars.length !== 1 || syms.length !== 2) return false;
  const k = bars[0].indexOf("thick");
  return !same(syms[0], syms[1]) && same(swapExcept(syms[0], k), syms[1]);
}

export interface SwapRule {
  optionScores: number[];
  validated: { label: string; ok: boolean }[];
  explained: ExplainedRule;
}

export function fitSwap(problem: MatrixProblem, missing: number): SwapRule | null {
  if (problem.rows !== 3 || problem.cols !== 3) return null;
  const target = Math.floor(missing / 3);
  const validated: { label: string; ok: boolean }[] = [];
  for (let r = 0; r < 3; r++) {
    if (r === target) continue;
    const line = [0, 1, 2].map((c) => seqOf(problem.cells[r * 3 + c]));
    if (line.some((s) => !s) || !lineHolds(line as Seq[])) return null;
    validated.push({ label: `Row ${r + 1}`, ok: true });
  }
  const known = [0, 1, 2].filter((c) => r3(target, c) !== missing).map((c) => seqOf(problem.cells[r3(target, c)]));
  if (known.some((s) => !s)) return null;
  const optionScores = problem.options.map((o) => {
    const s = seqOf(o);
    if (!s) return 0;
    const line = [0, 1, 2].map((c) => (r3(target, c) === missing ? s : seqOf(problem.cells[r3(target, c)])!));
    return lineHolds(line) ? 1 : 0;
  });
  return {
    optionScores,
    validated,
    explained: {
      text: "In each row the thick bar marks the position that stays the same; in the two symbol cells the other two symbols swap places.",
      attribute: "cell",
      kind: "swap",
      axis: "row",
      complexity: 2.5,
      validation: validated,
      prediction: `Row ${target + 1}: keep the symbol under the thick bar and swap the other two`,
      informative: true,
    },
  };
}

const r3 = (row: number, col: number) => row * 3 + col;
