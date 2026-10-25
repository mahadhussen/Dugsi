// The verdict on one recitation, from everything the follower saw.
//
// The rule that shapes all of it: a wrong verdict is worse than none. A word is
// only "skipped" when nothing was said where it belongs. Where there was voice
// the model could not make out (noise, a cough, a word the model does not know,
// or a stretch it dropped), the words there are "unclear": not counted, not
// red, and the reciter is told we could not hear that part.

import type { AlignedWord, AlignmentResult, WordStatus } from "@/lib/align";
import { evaluateMadd, type TimedWord, type TimingReport } from "@/lib/tajweed/timing";
import type { TimeRange } from "@/lib/review";
import type { Word } from "@/lib/quran/types";
import { bestMarks, type FollowState, type PieceRecord } from "./follower";

/** Voice the model produced no word for, at least this long, makes the words
 *  around it unclear instead of skipped. */
const UNEXPLAINED_S = 0.8;
/** Slack around a recognised word's timestamps before voice counts as unexplained. */
const PAD_S = 0.25;

export type MistakeKind = "wrong" | "skipped" | "corrected";

export interface TypedMistake {
  refIndex: number;
  kind: MistakeKind;
  /** What was heard instead (normalised), null when skipped. */
  heard: string | null;
}

export interface Verdict {
  transcript: string;
  engine: string;
  alignment: AlignmentResult;
  timing: TimingReport;
  score: number;
  summary: string;
  matchRate: number;
  reliable: boolean;
  /** Words in the recited span we could not hear well enough to judge. */
  unclear: number;
  /** Where each recited word sits in the recording (for "hear yourself"). */
  clips: Record<number, TimeRange>;
  /** Mistakes with their kind, in text order. */
  mistakes: TypedMistake[];
  /** Places the reciter jumped to (verse numbers), e.g. a mixed-up verse. */
  jumps: { fromVerse: number; toVerse: number }[];
  /** Heard words that belong nowhere in the text. */
  extras: string[];
}

interface Interval {
  a: number;
  b: number;
}

/** Voice inside a piece that no recognised word accounts for. */
function unexplainedVoice(p: PieceRecord): Interval[] {
  const voiced = p.input.voiced ?? [];
  const words = p.input.words ?? [];
  if (!voiced.length || !words.length) return [];
  const covered: Interval[] = words.map((w) => {
    const letters = w.text.replace(/[^ء-ي]/g, "").length;
    const cap = Math.max(1.2, 0.45 * letters); // timestamps can stretch over noise
    return { a: w.start - PAD_S, b: Math.min(w.end, w.start + cap) + PAD_S };
  });
  const out: Interval[] = [];
  for (const [va, vb] of voiced) {
    let pieces: Interval[] = [{ a: va, b: vb }];
    for (const c of covered) {
      const next: Interval[] = [];
      for (const s of pieces) {
        if (c.b <= s.a || c.a >= s.b) next.push(s);
        else {
          if (c.a > s.a) next.push({ a: s.a, b: c.a });
          if (c.b < s.b) next.push({ a: c.b, b: s.b });
        }
      }
      pieces = next;
    }
    out.push(...pieces.filter((s) => s.b - s.a >= 0.15));
  }
  return out;
}

function overlap(list: Interval[], a: number, b: number): number {
  let t = 0;
  for (const s of list) t += Math.max(0, Math.min(b, s.b) - Math.max(a, s.a));
  return t;
}

/** Recording time of a text word inside a piece, from the model's timings. */
function timeOf(p: PieceRecord, refIndex: number): TimeRange | null {
  if (!p.align || !p.input.words) return null;
  for (const pair of p.align.pairs) {
    if (refIndex < pair.ref || refIndex >= pair.refEnd) continue;
    const wi = p.tokenWord.slice(pair.heard, pair.heardEnd).filter((w) => w >= 0);
    if (!wi.length) return null;
    const first = p.input.words[Math.min(...wi)];
    const last = p.input.words[Math.max(...wi)];
    if (!first || !last || !(last.end > first.start)) return null;
    return { start: first.start, end: last.end };
  }
  return null;
}

export interface VerdictOptions {
  /** The text words (for the madd check). */
  words: Word[];
  engine: string;
}

export function verdictOf(state: FollowState, opts: VerdictOptions): Verdict {
  const best = bestMarks(state);
  const aligned = state.pieces.filter((p) => p.kind === "aligned" && p.align);
  const transcript = state.pieces.map((p) => p.input.text).filter(Boolean).join(" ");
  const extras: string[] = [];
  for (const p of aligned) for (const e of p.align!.extras) extras.push(p.tokens[e]);

  let lo = Infinity;
  let hi = -Infinity;
  for (const k of best.keys()) {
    lo = Math.min(lo, k);
    hi = Math.max(hi, k);
  }
  const unexplained = new Map<PieceRecord, Interval[]>();
  for (const p of state.pieces) unexplained.set(p, unexplainedVoice(p));

  // Final status of every word in the recited span.
  const statusOf = new Map<number, WordStatus>();
  if (lo <= hi) {
    for (let k = lo; k <= hi; k++) {
      const m = best.get(k);
      if (!m || m.status === "missing") continue;
      // A word at a cut made by the length cap may be cut in two: if that is
      // its only evidence of being wrong, we did not hear it, it was not wrong.
      if (m.status === "wrong" && atCut(state.pieces[m.piece], k)) statusOf.set(k, "unclear");
      else statusOf.set(k, m.status);
    }
    // Every run of words no piece said: skipped, or unclear?
    let k = lo;
    while (k <= hi) {
      if (statusOf.has(k)) {
        k++;
        continue;
      }
      const a = k;
      while (k <= hi && !statusOf.has(k)) k++;
      const b = k; // run is [a, b)
      const verdict = runVerdict(state, best, unexplained, a, b);
      for (let i = a; i < b; i++) statusOf.set(i, verdict);
    }
  }

  const clips: Record<number, TimeRange> = {};
  for (const [k, m] of best) {
    if (m.status === "missing") continue;
    const t = timeOf(state.pieces[m.piece], k);
    if (t) clips[k] = t;
  }

  const words: AlignedWord[] = [];
  for (const [k, st] of Array.from(statusOf.entries()).sort((x, y) => x[0] - y[0])) {
    const m = best.get(k);
    words.push({
      refIndex: k,
      expected: state.ref.norm[k],
      heard: st === "missing" || st === "unclear" ? null : m?.heard ?? null,
      status: st,
      score: 0,
    });
  }
  const judged = words.filter((w) => w.status !== "unclear");
  const correct = judged.filter((w) => w.status === "correct").length;
  const close = judged.filter((w) => w.status === "close").length;
  const accuracy = judged.length ? correct / judged.length : 0;
  const unclear = words.length - judged.length;

  // Madd timing from the words that carry a duration. Word timestamps are too
  // coarse to judge a two-count madd (measured: four of Alafasy's flagged as
  // rushed), so only the six-count madd lazim is judged, and only when it is
  // held for less than half its expected length.
  const timed: TimedWord[] = [];
  const expected: { norm: string; madd?: "natural" | "lazim"; refIndex: number }[] = [];
  for (const w of words) {
    const c = clips[w.refIndex];
    if (!c || w.status !== "correct") continue;
    const madd = opts.words[w.refIndex]?.madd;
    timed.push({ word: w.expected, start: c.start, end: c.end });
    expected.push({ norm: w.expected, madd: madd === "lazim" ? "lazim" : undefined, refIndex: w.refIndex });
  }
  const timing = evaluateMadd(timed, expected, 0.5);
  const rushed = timing.checks.filter((c) => c.verdict === "rushed").length;
  const maddPenalty = timing.checks.length ? (rushed / timing.checks.length) * 10 : 0;
  const score = Math.max(0, Math.round(accuracy * 100 - maddPenalty));

  const heardTokens = aligned.reduce((s, p) => s + p.tokens.length, 0);
  const matchRate = judged.length ? (correct + close) / judged.length : 0;
  // Confidence gate: enough heard, enough judged, the recogniser clearly
  // working, and most of the recited span actually heard.
  const reliable =
    heardTokens >= 3 && judged.length >= 2 && matchRate >= 0.45 && (words.length === 0 || unclear / words.length <= 0.6);

  const mistakes: TypedMistake[] = [];
  for (const w of words) {
    const m = best.get(w.refIndex);
    if (w.status === "wrong") mistakes.push({ refIndex: w.refIndex, kind: "wrong", heard: m?.heard ?? null });
    else if (w.status === "missing") mistakes.push({ refIndex: w.refIndex, kind: "skipped", heard: null });
    else if (m?.corrected) mistakes.push({ refIndex: w.refIndex, kind: "corrected", heard: null });
  }

  const jumps = aligned
    .filter((p) => p.jumped && p.align)
    .map((p) => ({ fromVerse: state.ref.ayah[Math.min(p.from, state.ref.ayah.length - 1)], toVerse: state.ref.ayah[p.align!.start] }));

  const alignment: AlignmentResult = { words, extras, accuracy };
  return {
    transcript,
    engine: opts.engine,
    alignment,
    timing,
    score,
    summary: summaryOf(words, rushed, timing.checks.length),
    matchRate,
    reliable,
    unclear,
    clips,
    mistakes,
    jumps,
    extras,
  };
}

/** Is text word k heard only at the very edge of a piece cut by the length cap? */
function atCut(p: PieceRecord, k: number): boolean {
  if (!p.align) return false;
  const pair = p.align.pairs.find((x) => k >= x.ref && k < x.refEnd);
  if (!pair) return false;
  return (!!p.input.cutStart && pair.heard === 0) || (!!p.input.cutEnd && pair.heardEnd === p.tokens.length);
}

/** Is a run of unsaid words [a, b) skipped, or did we just not hear it? */
function runVerdict(
  state: FollowState,
  best: ReturnType<typeof bestMarks>,
  unexplained: Map<PieceRecord, Interval[]>,
  a: number,
  b: number,
): WordStatus {
  const before = best.get(a - 1);
  const after = best.get(b);
  if (!before || !after) return "unclear";
  const pb = state.pieces[before.piece];
  const pa = state.pieces[after.piece];

  if (pb === pa) {
    // Inside one piece: believe a skip unless there was voice in between.
    const t1 = timeOf(pb, a - 1);
    const t2 = timeOf(pb, b);
    if (!t1 || !t2) return b - a <= 3 ? "missing" : "unclear";
    return overlap(unexplained.get(pb) ?? [], t1.end, t2.start) >= UNEXPLAINED_S ? "unclear" : "missing";
  }

  // Between pieces. Out of time order (a re-read) is too ambiguous to accuse,
  // and so is a gap at a cut the length cap made (the word may be in two halves).
  if (pb.input.t0 > pa.input.t0) return "unclear";
  if (pb.input.cutEnd || pa.input.cutStart) return "unclear";
  // Any piece in between that we could not place means voice we could not read.
  const iB = state.pieces.indexOf(pb);
  const iA = state.pieces.indexOf(pa);
  for (let i = iB + 1; i < iA; i++) if (state.pieces[i].kind === "unclear") return "unclear";
  // Voice after the last word of the piece before, or before the first word of
  // the piece after: something was said there that the model did not write.
  const tb = timeOf(pb, a - 1);
  const ta = timeOf(pa, b);
  const tail = tb ? overlap(unexplained.get(pb) ?? [], tb.end, pb.input.t1) : 0;
  const head = ta ? overlap(unexplained.get(pa) ?? [], pa.input.t0, ta.start) : 0;
  return tail + head >= UNEXPLAINED_S ? "unclear" : "missing";
}

function summaryOf(words: AlignedWord[], rushed: number, maddTotal: number): string {
  const judged = words.filter((w) => w.status !== "unclear");
  if (judged.length === 0) {
    return "We couldn't match your recitation to these verses. Try reciting a passage you can see on screen.";
  }
  const correct = judged.filter((w) => w.status === "correct").length;
  const missing = judged.filter((w) => w.status === "missing").length;
  const wrong = judged.filter((w) => w.status === "wrong").length;
  const unclear = words.length - judged.length;
  const parts = [`${correct}/${judged.length} words recited correctly.`];
  if (missing > 0) parts.push(`${missing} word${missing > 1 ? "s" : ""} skipped.`);
  if (wrong > 0) parts.push(`${wrong} word${wrong > 1 ? "s" : ""} need work.`);
  if (unclear > 0) parts.push(`${unclear} word${unclear > 1 ? "s" : ""} we could not hear clearly, so they are not counted.`);
  if (maddTotal > 0 && rushed > 0) parts.push(`${rushed} elongation${rushed > 1 ? "s" : ""} may have been rushed.`);
  else if (maddTotal > 0) parts.push("Elongations look well held.");
  return parts.join(" ");
}
