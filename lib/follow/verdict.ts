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
import { alignWindow } from "./align";
import { CLOSE } from "./phonetic";
import { isQuranWord } from "./lexicon";
import { bestMarks, voicedSeconds, type FollowState, type PieceRecord } from "./follower";

/** Voice the model produced no word for, at least this long, makes the words
 *  around it unclear instead of skipped. */
const UNEXPLAINED_S = 0.8;
/** A piece the model wrote nothing for, with this much voice, may have held the
 *  words around it. Lower than above: none of its voice is explained by a word. */
const EMPTY_VOICE_S = 0.3;
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
  // Added words: only inside a piece. A stray token at a piece's very edge is
  // the model's onset or tail noise (Alafasy's "اذ"), not something recited.
  const extras: string[] = [];
  for (const p of aligned) for (const e of p.align!.extras) if (e > 0 && e < p.tokens.length - 1) extras.push(p.tokens[e]);

  const { statusOf, heardOf } = judgeWords(state, best);

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
      heard: st === "missing" || st === "unclear" ? null : heardOf.get(k) ?? m?.heard ?? null,
      status: st,
      // What the word earns: said right 1, nearly right as alike as it was
      // heard (a recogniser's misspelling must not cost like a wrong word).
      score: st === "correct" ? 1 : st === "close" ? m?.sim ?? CLOSE : 0,
    });
  }
  const judged = words.filter((w) => w.status !== "unclear");
  const correct = judged.filter((w) => w.status === "correct").length;
  const close = judged.filter((w) => w.status === "close").length;
  const accuracy = judged.length ? judged.reduce((t, w) => t + w.score, 0) / judged.length : 0;
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
  // 100 means every word heard was said right: a nearly-right word never rounds up to it.
  const raw = Math.max(0, Math.round(accuracy * 100 - maddPenalty));
  const score = correct < judged.length ? Math.min(99, raw) : raw;

  const heardTokens = aligned.reduce((s, p) => s + p.tokens.length, 0);
  const matchRate = judged.length ? (correct + close) / judged.length : 0;
  // Of everything said, how much found its place in this text? Reciting a
  // different surah than the one on screen leaves most pieces unplaced, and a
  // verdict from the few that happen to match would be nonsense.
  const placed = aligned.length;
  const unplaced = state.pieces.filter((p) => p.kind === "unclear").length;
  const placedShare = placed + unplaced ? placed / (placed + unplaced) : 0;
  // Confidence gate: enough heard, enough judged, the recogniser clearly
  // working, most of the recited span heard, and most of the voice placed.
  const reliable =
    heardTokens >= 3 &&
    judged.length >= 2 &&
    matchRate >= 0.45 &&
    placedShare >= 0.5 &&
    (words.length === 0 || unclear / words.length <= 0.6);

  const mistakes: TypedMistake[] = [];
  for (const w of words) {
    const m = best.get(w.refIndex);
    if (w.status === "wrong") mistakes.push({ refIndex: w.refIndex, kind: "wrong", heard: w.heard });
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

/**
 * The status of every word from the first to the last one heard — the one
 * place this is decided. The live picture while reciting and the verdict at
 * the end both come from here, so they can never disagree.
 */
export function judgeWords(
  state: FollowState,
  best: ReturnType<typeof bestMarks> = bestMarks(state),
): { statusOf: Map<number, WordStatus>; heardOf: Map<number, string> } {
  const statusOf = new Map<number, WordStatus>();
  const heardOf = new Map<number, string>();
  let lo = Infinity;
  let hi = -Infinity;
  for (const k of best.keys()) {
    lo = Math.min(lo, k);
    hi = Math.max(hi, k);
  }
  if (lo > hi) return { statusOf, heardOf };
  const unexplained = new Map<PieceRecord, Interval[]>();
  for (const p of state.pieces) unexplained.set(p, unexplainedVoice(p));

  for (let k = lo; k <= hi; k++) {
    const m = best.get(k);
    if (!m || m.status === "missing") continue;
    // A word heard wrong at a piece's edge is accused only where a reciter
    // stops: see edgeHolds. Elsewhere the pause may have cut the word in two
    // ("ولغر" | "ضالين" for وَلَا ٱلضَّآلِّينَ), and that proves nothing.
    if (m.status === "wrong" && !edgeHolds(state, m.piece, k)) statusOf.set(k, "unclear");
    else statusOf.set(k, m.status);
  }
  // Every run of words no piece placed: said as something else, skipped, or unclear?
  let k = lo;
  while (k <= hi) {
    if (statusOf.has(k)) {
      k++;
      continue;
    }
    const a = k;
    while (k <= hi && !statusOf.has(k)) k++;
    const b = k; // run is [a, b)
    // A word said in the slot just after the piece before, or just before the
    // piece after, but not matched to anything (the free end of a piece takes
    // it as "added"): that is what was said instead of these words.
    const slot = edgeSlots(state, best, a, b);
    for (const [i, said] of slot) {
      statusOf.set(i, said.fragment ? "unclear" : "wrong");
      if (!said.fragment) heardOf.set(i, said.text);
    }
    const rest = Array.from({ length: b - a }, (_, j) => a + j).filter((i) => !slot.has(i));
    if (rest.length) {
      const verdict = runVerdict(state, best, unexplained, Math.min(...rest), Math.max(...rest) + 1);
      for (const i of rest) statusOf.set(i, verdict);
    }
  }
  return { statusOf, heardOf };
}

/** Marks to paint while reciting — the same judgement as the verdict. */
export function liveMarks(state: FollowState): Record<number, WordStatus> {
  const out: Record<number, WordStatus> = {};
  for (const [k, v] of judgeWords(state).statusOf) out[k] = v;
  return out;
}

const isFragment = (tokens: string[]) => tokens.length !== 1 || tokens[0].length <= 2;

/** Is text word k the last word of its verse? */
const endsVerse = (ref: FollowState["ref"], k: number) => k + 1 >= ref.norm.length || ref.ayah[k + 1] !== ref.ayah[k];

/** Was a piece heard cleanly — placed, or a preamble, or no voice at all? */
const clean = (p: PieceRecord | undefined) =>
  !p || p.kind === "aligned" || p.kind === "preamble" || (p.kind === "empty" && voicedSeconds(p.input) < EMPTY_VOICE_S);

/**
 * May a word heard wrong at an edge of its piece be called wrong? Only when
 * what was heard is a whole word of the Quran, the edge is where a reciter
 * stops (the start or end of a verse), and nothing unheard, cut or out of
 * reach lies across it: no length-cap cut, not the moment listening began, the
 * neighbouring piece heard cleanly. The middle of a piece is judged as heard.
 */
function edgeHolds(state: FollowState, pi: number, k: number): boolean {
  const p = state.pieces[pi];
  if (!p.align) return true;
  const pairs = p.align.pairs;
  const pair = pairs.find((x) => k >= x.ref && k < x.refEnd);
  if (!pair) return true;
  const first = pair === pairs[0];
  const last = pair === pairs[pairs.length - 1];
  if (!first && !last) return true;
  const said = p.tokens.slice(pair.heard, pair.heardEnd);
  if (isFragment(said) || pair.refEnd - pair.ref > 1 || !isQuranWord(said[0])) return false;
  if (first && (p.input.cutStart || p.input.t0 === 0 || state.ref.inAyah[k] !== 0 || !clean(state.pieces[pi - 1]))) return false;
  if (last && (p.input.cutEnd || !endsVerse(state.ref, k) || !clean(state.pieces[pi + 1]))) return false;
  return true;
}

/**
 * Words left over at the tail of the piece before a run, or the head of the
 * piece after it, paired with the run's words in order: what was said
 * instead of them. The same guards as runVerdict hold — the model's own
 * word times (not the browser's), the two pieces next to each other in time
 * with nothing between, no cut — and the pause must fall where a reciter
 * stops, at a verse's end or start.
 */
function edgeSlots(
  state: FollowState,
  best: ReturnType<typeof bestMarks>,
  a: number,
  b: number,
): Map<number, { text: string; fragment: boolean }> {
  const out = new Map<number, { text: string; fragment: boolean }>();
  const before = best.get(a - 1);
  const after = best.get(b);
  if (!before || !after) return out;
  const pb = state.pieces[before.piece];
  const pa = state.pieces[after.piece];
  if (!pb.align || !pa.align || !pb.input.voiced || !pa.input.voiced) return out;
  if (after.piece !== before.piece + 1 || pb.input.t0 > pa.input.t0) return out;
  const word = (t: string) => ({ text: t, fragment: isFragment([t]) || !isQuranWord(t) });
  if (pb.align.end === a && !pb.input.cutEnd) {
    const lastPair = pb.align.pairs[pb.align.pairs.length - 1];
    const tail = pb.tokens.slice(lastPair ? lastPair.heardEnd : 0).slice(0, b - a);
    if (tail.length && endsVerse(state.ref, a + tail.length - 1)) tail.forEach((t, j) => out.set(a + j, word(t)));
  }
  if (pa.align.start === b && !(pa.input.cutStart || pa.input.t0 === 0)) {
    const firstPair = pa.align.pairs[0];
    const head = pa.tokens.slice(0, firstPair ? firstPair.heard : 0);
    const take = head.slice(-Math.min(head.length, b - a));
    if (take.length && state.ref.inAyah[b - take.length] === 0) {
      take.reverse().forEach((t, j) => {
        const i = b - 1 - j;
        if (i >= a && !out.has(i)) out.set(i, word(t));
      });
    }
  }
  return out;
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
    // No word times (the browser's recogniser): it drops words inside a
    // phrase too, so a gap proves nothing.
    if (!t1 || !t2) return "unclear";
    return overlap(unexplained.get(pb) ?? [], t1.end, t2.start) >= UNEXPLAINED_S ? "unclear" : "missing";
  }

  // Between pieces. Out of time order (a re-read) is too ambiguous to accuse,
  // and so is a gap at a cut the length cap made (the word may be in two halves).
  if (pb.input.t0 > pa.input.t0) return "unclear";
  if (pb.input.cutEnd || pa.input.cutStart) return "unclear";
  // Without a voice map (the browser's recogniser) a gap between two of its
  // results says nothing about whether the words were said: it drops whole
  // phrases when it restarts.
  if (!pb.input.voiced || !pa.input.voiced) return "unclear";
  // Any piece said in between — one we could not place, or one placed
  // somewhere else (a refrain or a look-alike verse landing on another copy) —
  // means voice there that may well have been these words.
  const iB = state.pieces.indexOf(pb);
  const iA = state.pieces.indexOf(pa);
  for (let i = iB + 1; i < iA; i++) {
    const p = state.pieces[i];
    if (p.kind === "unclear" || p.kind === "aligned") return "unclear";
    // Voice the model wrote nothing for: a one-word verse ("مُدْهَآمَّتَانِ")
    // can come back empty, and was still said.
    if (p.kind === "empty" && voicedSeconds(p.input) >= EMPTY_VOICE_S) return "unclear";
  }
  // A piece whose words another piece covers too (the model wrote the end of
  // a verse for audio of its start, then the end again) cannot vouch that the
  // words before or after it were left out: its voice may have been them.
  // (Most of it, two words or more: a garbled onset laid over the word
  // before is not a second copy.)
  const shared = (p: PieceRecord) =>
    state.pieces.some((q) => {
      if (q === p || !q.align || !p.align) return false;
      const both = Math.min(q.align.end, p.align.end) - Math.max(q.align.start, p.align.start);
      return both >= 2 && 2 * both >= p.align.end - p.align.start;
    });
  if (shared(pb) || shared(pa)) return "unclear";
  // Could the piece before have been the copy right in front of the piece
  // after (identical verse openings, 2:97/2:98)? Then it is not known which
  // words were left out.
  if (pb.align) {
    const len = pb.align.end - pb.align.start;
    const alt = alignWindow(state.ref, pb.tokens, Math.max(state.start, b - 2 * len - 10), b, (i) => -0.002 * Math.abs(b - len - i));
    if (alt && alt.end === b && alt.matched >= pb.align.matched) return "unclear";
  }
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
  const close = judged.filter((w) => w.status === "close").length;
  if (close > 0) parts.push(`${close} word${close > 1 ? "s" : ""} nearly right.`);
  if (missing > 0) parts.push(`${missing} word${missing > 1 ? "s" : ""} skipped.`);
  if (wrong > 0) parts.push(wrong > 1 ? `${wrong} words need work.` : "1 word needs work.");
  if (unclear > 0) parts.push(`${unclear} word${unclear > 1 ? "s" : ""} we could not hear clearly, so they are not counted.`);
  if (maddTotal > 0 && rushed > 0) parts.push(`${rushed} elongation${rushed > 1 ? "s" : ""} may have been rushed.`);
  else if (maddTotal > 0) parts.push("Elongations look well held.");
  return parts.join(" ");
}
