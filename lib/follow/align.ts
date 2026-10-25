// Lays one heard piece of recitation against the text.
//
// Semi-global alignment: the piece must be used up, the text may start and end
// anywhere in the window. Beyond the usual match / skipped word / added word,
// two moves absorb the recogniser splitting or joining words ("إذ دنا" for
// "ٱهْدِنَا", "يا أيها" for "يَٰٓأَيُّهَا"). A start cost keeps the piece near
// where the reciter was, so a common phrase elsewhere does not pull it away.
//
// When the window does not explain the piece (the reciter carried on past a
// verse the recogniser missed, or jumped), pairs of heard words are looked up
// in the whole text and the best-scoring candidate place is aligned too.

import { CLOSE, skeleton, wordSim } from "./phonetic";
import type { RefText } from "./text";

export interface Pair {
  /** Text words [ref, refEnd) — two when the recogniser joined them. */
  ref: number;
  refEnd: number;
  /** Heard tokens [heard, heardEnd) — two when the recogniser split a word. */
  heard: number;
  heardEnd: number;
  sim: number;
}

export interface Alignment {
  /** Text span the piece covers, [start, end). */
  start: number;
  end: number;
  pairs: Pair[];
  /** Text words inside the span the piece did not contain. */
  skipped: number[];
  /** Heard tokens that belong to no text word. */
  extras: number[];
  score: number;
  /** Text words matched at least "close". */
  matched: number;
}

const SKIP = -0.5;
const EXTRA = -0.4;
const JOIN = -0.1;
const SUB_FLOOR = -0.8; // above SKIP + EXTRA (-0.9)
const matchScore = (sim: number) => 2 * (sim - 0.5);

const enum Op {
  Start,
  Diag,
  MergeHeard,
  SplitRef,
  SkipRef,
  Extra,
}

/**
 * Best alignment of `heard` (normalised tokens) against text words [lo, hi).
 * `startCost(i)` is added for starting at text word i (≤ 0).
 */
export function alignWindow(
  ref: RefText,
  heard: string[],
  lo: number,
  hi: number,
  startCost: (i: number) => number,
): Alignment | null {
  const m = heard.length;
  lo = Math.max(0, lo);
  hi = Math.min(ref.norm.length, hi);
  const W = hi - lo;
  if (m === 0 || W <= 0) return null;
  const r = ref.norm;
  const cols = m + 1;
  const S = new Float64Array((W + 1) * cols);
  const B = new Uint8Array((W + 1) * cols);
  const at = (i: number, j: number) => i * cols + j;

  for (let i = 0; i <= W; i++) {
    S[at(i, 0)] = startCost(lo + i);
    B[at(i, 0)] = Op.Start;
  }
  for (let j = 1; j <= m; j++) {
    S[at(0, j)] = S[at(0, j - 1)] + EXTRA;
    B[at(0, j)] = Op.Extra;
  }
  for (let i = 1; i <= W; i++) {
    const ri = r[lo + i - 1];
    for (let j = 1; j <= m; j++) {
      // A heard word in a text word's slot is a substitution ("said X
      // instead"), never cheaper to explain as a skip plus an added word.
      let best = S[at(i - 1, j - 1)] + Math.max(SUB_FLOOR, matchScore(wordSim(ri, heard[j - 1])));
      let op = Op.Diag;
      if (j >= 2) {
        const v = S[at(i - 1, j - 2)] + matchScore(wordSim(ri, heard[j - 2] + heard[j - 1])) + JOIN;
        if (v > best) {
          best = v;
          op = Op.MergeHeard;
        }
      }
      if (i >= 2) {
        // Two text words heard as one ("ربالعالمين"). Worth about one good word,
        // and only when it really is both: otherwise the free end would happily
        // swallow the first word of the next verse into the last one heard.
        const sim = wordSim(r[lo + i - 2] + ri, heard[j - 1]);
        const v = sim >= 0.6 ? S[at(i - 2, j - 1)] + 2 * matchScore(sim) - 0.7 : -Infinity;
        if (v > best) {
          best = v;
          op = Op.SplitRef;
        }
      }
      const skip = S[at(i - 1, j)] + SKIP;
      if (skip > best) {
        best = skip;
        op = Op.SkipRef;
      }
      const extra = S[at(i, j - 1)] + EXTRA;
      if (extra > best) {
        best = extra;
        op = Op.Extra;
      }
      S[at(i, j)] = best;
      B[at(i, j)] = op;
    }
  }

  let endI = 0;
  for (let i = 1; i <= W; i++) if (S[at(i, m)] > S[at(endI, m)]) endI = i;

  const pairs: Pair[] = [];
  const skipped: number[] = [];
  const extras: number[] = [];
  let i = endI;
  let j = m;
  while (!(j === 0 && B[at(i, j)] === Op.Start)) {
    const op = j === 0 ? Op.Start : B[at(i, j)];
    if (op === Op.Start) break;
    if (op === Op.Diag) {
      pairs.push({ ref: lo + i - 1, refEnd: lo + i, heard: j - 1, heardEnd: j, sim: wordSim(r[lo + i - 1], heard[j - 1]) });
      i--;
      j--;
    } else if (op === Op.MergeHeard) {
      pairs.push({ ref: lo + i - 1, refEnd: lo + i, heard: j - 2, heardEnd: j, sim: wordSim(r[lo + i - 1], heard[j - 2] + heard[j - 1]) });
      i--;
      j -= 2;
    } else if (op === Op.SplitRef) {
      pairs.push({ ref: lo + i - 2, refEnd: lo + i, heard: j - 1, heardEnd: j, sim: wordSim(r[lo + i - 2] + r[lo + i - 1], heard[j - 1]) });
      i -= 2;
      j--;
    } else if (op === Op.SkipRef) {
      skipped.push(lo + i - 1);
      i--;
    } else {
      extras.push(j - 1);
      j--;
    }
  }
  pairs.reverse();
  skipped.reverse();
  extras.reverse();
  // Skips before the first pair are not skips: the piece simply starts later.
  const start = pairs.length ? pairs[0].ref : lo + i;
  const end = pairs.length ? pairs[pairs.length - 1].refEnd : start;
  let matched = 0;
  for (const p of pairs) if (p.sim >= CLOSE) matched += p.refEnd - p.ref;
  return {
    start,
    end,
    pairs,
    skipped: skipped.filter((k) => k >= start && k < end),
    extras,
    score: S[at(endI, m)],
    matched,
  };
}

/** Candidate start positions for `heard` anywhere in the text, best first;
 *  equal evidence goes to the place nearest `near` (the reciter's position). */
export function anchorCandidates(ref: RefText, heard: string[], max = 4, near = 0): number[] {
  const votes = new Map<number, number>();
  for (let j = 0; j + 1 < heard.length; j++) {
    const exact = ref.pairs.get(`${heard[j]} ${heard[j + 1]}`) ?? [];
    for (const p of exact) votes.set(p - j, (votes.get(p - j) ?? 0) + 1);
    const loose = ref.pairs.get(`~${skeleton(heard[j])} ${skeleton(heard[j + 1])}`) ?? [];
    for (const p of loose) votes.set(p - j, (votes.get(p - j) ?? 0) + 0.6);
  }
  return Array.from(votes.entries())
    .filter(([, v]) => v >= 1)
    .sort((a, b) => b[1] - a[1] || Math.abs(a[0] - near) - Math.abs(b[0] - near))
    .slice(0, max)
    .map(([c]) => c);
}

export interface Placement {
  align: Alignment;
  /** Found by searching the whole text, far from where the reciter was. */
  jumped: boolean;
}

const BACK = 40; // words behind the cursor a re-read may start
const AHEAD = 60; // words ahead a piece may start (a missed verse or two)
const DIST = 0.012; // start cost per word away from the cursor
// Going back costs more than going on: a repeated refrain (Ar-Rahman) or a
// look-alike verse must land on the next copy, not the one already recited.
const BACK_FACTOR = 1.6;
const DIST_CAP = 0.7;
const JUMP = 1.0; // extra cost of a place found by searching the whole text

/** Where in [lo, hi) does this piece belong, given the reciter was at `cursor`? */
export function placePiece(ref: RefText, heard: string[], cursor: number, lo: number, hi: number): Placement | null {
  const m = heard.length;
  const wLo = Math.max(lo, cursor - BACK);
  const wHi = Math.min(hi, cursor + AHEAD + 2 * m);
  const local = alignWindow(ref, heard, wLo, wHi, (i) => -Math.min(DIST_CAP, DIST * (i < cursor ? BACK_FACTOR : 1) * Math.abs(i - cursor)));
  let best: Placement | null = local ? { align: local, jumped: false } : null;

  if (m >= 2) {
    for (const c of anchorCandidates(ref, heard, 4, cursor)) {
      if (c >= wLo && c + m <= wHi) continue; // already inside the window
      if (c + m <= lo || c >= hi) continue; // outside the practised range
      const g = alignWindow(ref, heard, Math.max(lo, c - 12), Math.min(hi, c + 2 * m + 12), (i) => -JUMP - 0.004 * Math.abs(i - c));
      if (!g) continue;
      const beatsLocal = !best || g.score > best.align.score + 0.6 || (best.align.matched < 2 && g.matched >= 2);
      if (beatsLocal && g.matched >= Math.min(3, m)) best = { align: g, jumped: true };
    }
  }
  return best;
}
