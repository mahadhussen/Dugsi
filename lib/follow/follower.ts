// The follower: where the reciter is, and what was heard of every word.
//
// A pure reducer. The listening pipeline hands it pieces of recitation as the
// model decodes them (each piece ≈ one breath, cut at a pause) and hints from
// faster but rougher sources (the browser's recogniser, a provisional decode of
// the piece still being spoken). Pieces decide marks; hints only move the
// cursor, so a guess can never paint a word red.
//
// What it guarantees:
//   - It keeps up: a verse the recogniser missed is passed over as soon as the
//     next piece is placed, and the cursor lands where the reciter is.
//   - It never accuses on thin evidence: words passed over are "unclear" until
//     the verdict looks at whether there was voice there (see verdict.ts).
//   - A re-read is a second chance, not an added word: every word keeps its
//     best attempt.

import type { WordStatus } from "@/lib/align";
import { tokenize } from "@/lib/arabic";
import { alignWindow, placePiece, type Alignment } from "./align";
import { CLOSE, CORRECT, spoken, wordSim } from "./phonetic";
import { isQuranWord } from "./lexicon";
import { vowelSlip, type VowelSlip } from "./harakat";
import type { RefText } from "./text";

/** One decoded piece, as the pipeline delivers it. Times are seconds on the
 *  recording clock. */
export interface PieceInput {
  id: number;
  t0: number;
  t1: number;
  text: string;
  /** Word timings from the model, when it gives them (same order as the words). */
  words?: { text: string; start: number; end: number }[];
  /** Where there was voice inside the piece, [start, end) seconds. */
  voiced?: [number, number][];
  /** Pieces this one replaces (a joined re-decode). */
  replaces?: number[];
  /** The piece begins / ends where the length cap cut a breath, not at a
   *  pause: the word there may be cut in two and is never judged wrong. */
  cutStart?: boolean;
  cutEnd?: boolean;
  /** The model could not decode this piece: there was voice, nothing was read. */
  failed?: boolean;
  /** "model" = the on-device Quran model; "browser" = the browser recogniser
   *  standing in when the model cannot run (no word times, no voice map). */
  source: "model" | "browser";
}

export type PieceKind = "aligned" | "unclear" | "empty" | "preamble";

export interface PieceRecord {
  input: PieceInput;
  /** Normalised tokens actually laid against the text (opening/closing formulas removed). */
  tokens: string[];
  /** Index into `tokens` → original word index (for timings). */
  tokenWord: number[];
  /** Tokens removed as isti'adha / basmala / sadaqa. */
  formula: string[];
  kind: PieceKind;
  align: Alignment | null;
  jumped: boolean;
  /** Cursor before this piece. */
  from: number;
  /** Where a short piece would have gone, too far to move on its own word:
   *  confirmed if the next piece carries on from there. */
  held?: Alignment;
  /** This piece carried on from the piece before's held place, which now stands. */
  confirmsHeld?: boolean;
}

/** A wrong vowel the vowel model heard on one text word. */
export interface CtcVowel {
  slip: VowelSlip;
  /** The word as said: the text word with the vowel heard. */
  said: string;
}

/**
 * What the vowel model judged, per piece (its input id): the text words it
 * heard with a wrong vowel. A word it judged right has no entry.
 */
export interface VowelBook {
  pieces: ReadonlyMap<number, ReadonlyMap<number, CtcVowel>>;
}

export interface FollowState {
  ref: RefText;
  /** Present when the vowel model judges this attempt: then only it decides
   *  vowels, and the listening model's vowel marks are not used. */
  vowels?: VowelBook;
  /** The practised part of the text, [start, end) word indices. */
  start: number;
  end: number;
  /** Next word to recite, as confirmed by decoded pieces. */
  cursor: number;
  /** Where the screen shows the reciter: the cursor, nudged ahead by hints. */
  live: number;
  /** Whether any piece has landed in the text yet (formulas only before that). */
  started: boolean;
  pieces: PieceRecord[];
}

export function createFollower(ref: RefText, range?: { start: number; end: number }, from?: number): FollowState {
  const start = Math.max(0, range?.start ?? 0);
  const end = Math.min(ref.norm.length, range?.end ?? ref.norm.length);
  // Reciting from a verse mid-surah: start looking there, not at word 0, or a
  // phrase that also occurs earlier anchors on the earlier copy.
  const at = Math.max(start, Math.min(end, from ?? start));
  return { ref, start, end, cursor: at, live: at, started: false, pieces: [] };
}

// ── Opening and closing formulas ───────────────────────────────────────────

const ISTIADHA = ["اعوذ", "بالله", "من", "الشيطان", "الرجيم"];
const BASMALA = ["بسم", "الله", "الرحمن", "الرحيم"];
const SADAQA = ["صدق", "الله", "العظيم"];

/** How many tokens of `tokens` spell `formula`, taken from the start (or the
 *  end), or 0. The joined-string match tolerates the recogniser splitting or
 *  joining words; the formula's first word must itself be there, so a verse
 *  that merely ends like it (69:33 "…بِٱللَّهِ ٱلْعَظِيمِ") or starts like the
 *  basmala (41:2 "…ٱلرَّحْمَٰنِ ٱلرَّحِيمِ") is never taken for it. */
function formulaSpan(tokens: string[], formula: string[], fromEnd: boolean): number {
  const target = formula.join("");
  let best = 0;
  let bestSim = 0;
  for (let n = Math.max(1, formula.length - 2); n <= Math.min(tokens.length, formula.length + 2); n++) {
    const part = fromEnd ? tokens.slice(tokens.length - n) : tokens.slice(0, n);
    if (wordSim(part[0], formula[0]) < 0.6) continue;
    const sim = wordSim(target, part.join(""));
    if (sim > bestSim) {
      bestSim = sim;
      best = n;
    }
  }
  return bestSim >= 0.78 ? best : 0;
}
const formulaPrefix = (tokens: string[], formula: string[]) => formulaSpan(tokens, formula, false);
const formulaSuffix = (tokens: string[], formula: string[]) => formulaSpan(tokens, formula, true);

/** Does the text itself start with the basmala here (Al-Fatiha 1:1, An-Naml 27:30)? */
function textHasBasmalaAt(ref: RefText, i: number): boolean {
  if (i + BASMALA.length > ref.norm.length) return false;
  return wordSim(BASMALA.join(""), ref.norm.slice(i, i + BASMALA.length).join("")) >= 0.9;
}

// ── Pieces ─────────────────────────────────────────────────────────────────

/** Tokens of a piece, with the index of the model word each came from. */
function tokensOf(input: PieceInput): { tokens: string[]; tokenWord: number[] } {
  if (input.words && input.words.length) {
    const tokens: string[] = [];
    const tokenWord: number[] = [];
    input.words.forEach((w, wi) => {
      for (const t of tokenize(w.text)) {
        tokens.push(t);
        tokenWord.push(wi);
      }
    });
    if (tokens.length) return { tokens, tokenWord };
  }
  const tokens = tokenize(input.text);
  return { tokens, tokenWord: tokens.map(() => -1) };
}

export function voicedSeconds(input: PieceInput): number {
  return (input.voiced ?? []).reduce((s, [a, b]) => s + Math.max(0, b - a), 0);
}

/** Place one piece against the text from `cursor`. Pure. */
export function placeInput(state: FollowState, input: PieceInput, cursor: number, started: boolean): PieceRecord {
  const { tokens: all, tokenWord: allWord } = tokensOf(input);
  let lead = 0;
  // Before the recitation has begun, the isti'adha and the basmala are a
  // preface, not the surah — unless the text itself starts with the basmala.
  if (!started) {
    const a = formulaPrefix(all, ISTIADHA);
    lead = a;
    if (!textHasBasmalaAt(state.ref, cursor)) lead += formulaPrefix(all.slice(a), BASMALA);
  }
  let tail = formulaSuffix(all.slice(lead), SADAQA);
  if (tail > 0 && lead + tail > all.length) tail = 0;
  const tokens = all.slice(lead, all.length - tail);
  const tokenWord = allWord.slice(lead, allWord.length - tail);
  const formula = [...all.slice(0, lead), ...all.slice(all.length - tail)];
  const base = { input, tokens, tokenWord, formula, from: cursor, jumped: false };

  if (input.failed) return { ...base, kind: "unclear", align: null };
  if (tokens.length === 0) {
    return { ...base, kind: formula.length ? "preamble" : voicedSeconds(input) >= 1 ? "unclear" : "empty", align: null };
  }
  // The piece before was held back (one word, too far to move on): if this
  // piece carries on right where it would have gone, the two together are
  // the evidence, and both stand. A learner who pauses after every word and
  // has left out a verse is followed again from the second word.
  const prev = state.pieces[state.pieces.length - 1];
  if (prev?.held) {
    const at = prev.held.end;
    const next = alignWindow(state.ref, tokens, at, Math.min(state.end, at + 2 * tokens.length + 2), (i) => (i === at ? 0 : -1e9));
    if (next && next.start === at && next.skipped.length === 0 && next.pairs.every((p) => p.sim >= SOLID) && solidWords(next) + solidWords(prev.held) >= 2) {
      return { ...base, kind: "aligned", align: next, jumped: true, confirmsHeld: true };
    }
  }
  const place = placePiece(state.ref, tokens, cursor, state.start, state.end, started && tokens.length >= 2);
  const a = place?.align ?? null;
  // Moving the cursor far takes real evidence: two or more words heard well.
  // One look-alike word (a hallucinated "طسم" on a madd tail landing on
  // "بسم" 28 words back) must not drag the reciter's place away — but its
  // place is kept, for the next piece to confirm.
  if (a && Math.abs(a.start - cursor) > 8 && solidWords(a) < 2) {
    const held = a.pairs.every((p) => p.sim >= SOLID) && a.skipped.length === 0 ? a : undefined;
    return { ...base, kind: "unclear", align: null, held };
  }
  // A piece explains itself when enough of what was heard landed on real words.
  const ok = !!a && a.matched >= 1 && a.matched >= Math.ceil(0.4 * Math.min(tokens.length, a.end - a.start + a.extras.length)) && a.score > -0.2;
  if (!ok) return { ...base, kind: "unclear", align: null };
  return { ...base, kind: "aligned", align: a, jumped: !!place?.jumped };
}

/**
 * Identical openings (2:68, 2:69 and 2:70 all begin "قَالُوا۟ ٱدْعُ لَنَا رَبَّكَ
 * يُبَيِّن لَّنَا") cannot be told apart from one piece: which copy it was is
 * decided by what follows. When a piece lands further on and leaves a gap, the
 * pieces before it are moved up to meet it if their words fit just as well
 * there — so the verse actually skipped is the one reported.
 */
function backfill(ref: RefText, pieces: PieceRecord[], lo: number): PieceRecord[] {
  const last = pieces.length - 1;
  const target = pieces[last].align;
  if (!target) return pieces;
  const prevIdx = last - 1;
  const prev = pieces[prevIdx];
  if (!prev || prev.kind !== "aligned" || !prev.align || prev.align.end >= target.start) return pieces;
  // Try blocks [k..prev] that start at a verse start, nearest first: move the
  // whole block up to end where the new piece starts, every piece fitting at
  // least as well, and the block landing on a verse start too. A lone word that
  // merely matches the end of the next verse ("ٱلْمِيزَانَ", 55:7/55:8) moves no
  // block, because its block does not fit there.
  for (let k = prevIdx; k >= Math.max(0, prevIdx - 8); k--) {
    const pk = pieces[k];
    if (pk.kind !== "aligned" || !pk.align) return pieces;
    if (k < prevIdx && pk.align.end !== pieces[k + 1].align!.start) return pieces; // block must be contiguous
    if (ref.inAyah[pk.align.start] !== 0) continue;
    const moved: PieceRecord[] = [];
    let s = target.start;
    let ok = true;
    for (let j = prevIdx; j >= k; j--) {
      const pj = pieces[j];
      const len = pj.align!.end - pj.align!.start;
      const alt = alignWindow(ref, pj.tokens, Math.max(lo, s - 2 * len - 10), s, (i) => -0.002 * Math.abs(s - len - i));
      if (!alt || alt.end !== s || alt.matched < pj.align!.matched || alt.score < pj.align!.score - 0.15) {
        ok = false;
        break;
      }
      moved.unshift({ ...pj, align: alt });
      s = alt.start;
    }
    if (!ok) return pieces;
    if (ref.inAyah[s] !== 0) continue;
    return [...pieces.slice(0, k), ...moved, pieces[last]];
  }
  return pieces;
}

/** Heard well enough to count towards moving the reciter's place. */
const SOLID = 0.75;
const solidWords = (a: Alignment) => a.pairs.filter((p) => p.sim >= SOLID).reduce((n, p) => n + (p.refEnd - p.ref), 0);

function advance(state: FollowState, rec: PieceRecord): FollowState {
  let pieces = [...state.pieces, rec];
  if (rec.kind !== "aligned" || !rec.align) return { ...state, pieces };
  if (rec.confirmsHeld) {
    const i = pieces.length - 2;
    const held = pieces[i];
    pieces[i] = { ...held, kind: "aligned", align: held.held!, jumped: true, held: undefined };
  }
  pieces = backfill(state.ref, pieces, state.start);
  const cursor = rec.align.end;
  // The screen follows the piece, but a hint that already ran ahead stays
  // ahead (the reciter is already in the next verse while this one decoded).
  const live = state.live > cursor && state.live - cursor < 40 ? state.live : cursor;
  return { ...state, pieces, cursor, live, started: true };
}

/**
 * A decoded piece arrives. When it replaces earlier pieces (a joined
 * re-decode), the follow is replayed from the first replaced piece so every
 * later decision sees the corrected picture. Deterministic either way.
 */
export function applyPiece(state: FollowState, input: PieceInput): FollowState {
  if (input.replaces && input.replaces.length) {
    const drop = new Set(input.replaces);
    const firstIdx = state.pieces.findIndex((p) => drop.has(p.input.id));
    if (firstIdx >= 0) {
      const keep = state.pieces.slice(0, firstIdx);
      const later = state.pieces.slice(firstIdx).filter((p) => !drop.has(p.input.id)).map((p) => p.input);
      let s: FollowState = replay(state, keep);
      s = advance(s, placeInput(s, input, s.cursor, s.started));
      for (const inp of later) s = advance(s, placeInput(s, inp, s.cursor, s.started));
      return s;
    }
  }
  return advance(state, placeInput(state, input, state.cursor, state.started));
}

/** Rebuild cursor state as if only `kept` had arrived (their placements stand). */
function replay(state: FollowState, kept: PieceRecord[]): FollowState {
  let s: FollowState = { ...state, cursor: state.start, live: state.start, started: false, pieces: [] };
  for (const p of kept) s = advance(s, p);
  return s;
}

/**
 * How well would this text fit here, without changing anything? Lets the
 * pipeline choose between decoding two pieces apart or joined.
 */
export function fitScore(state: FollowState, inputs: PieceInput[]): number {
  let s = state;
  let total = 0;
  for (const inp of inputs) {
    const rec = placeInput(s, inp, s.cursor, s.started);
    total += rec.align ? rec.align.matched - 0.5 * rec.align.skipped.length - 0.3 * rec.align.extras.length : -rec.tokens.length * 0.5;
    s = advance(s, rec);
  }
  return total;
}

// ── Hints ──────────────────────────────────────────────────────────────────

/**
 * A rough, fast transcript of what is being said right now. Only the last few
 * words are used, so it does not matter that browser recognisers revise and
 * restart: the tail always says where the reciter is. The last word of a
 * provisional decode may be cut mid-word, so callers drop it.
 */
export function applyHint(state: FollowState, text: string): FollowState {
  const tokens = tokenize(text).slice(-5);
  if (tokens.length < 2) return state;
  const from = state.live;
  const a = alignWindow(state.ref, tokens, Math.max(state.start, from - 4), Math.min(state.end, from + 40), (i) => -0.02 * Math.abs(i - from));
  if (!a || a.matched < 2) return state;
  const strong = a.pairs.filter((p) => p.sim >= 0.75).length;
  if (strong < 2 || a.end <= state.live) return state;
  return { ...state, live: a.end };
}

// ── Marks ──────────────────────────────────────────────────────────────────

// A word heard but not made out still outranks one not heard at all.
const RANK: Record<WordStatus, number> = { correct: 4, close: 3, wrong: 2, unclear: 1.5, missing: 1 };

export function statusOfSim(sim: number): WordStatus {
  return sim >= CORRECT ? "correct" : sim >= CLOSE ? "close" : "wrong";
}

/**
 * The status of one heard word against the text word it was lined up with.
 * "Wrong" means another word was said, so what was heard must be a word of
 * the Quran; letters that are no word are the model failing, not the reciter.
 */
export function statusOfPair(heard: string, expected: string, sim: number): WordStatus {
  const st = statusOfSim(sim);
  // A scrap half the word's length or less ("لت" for "لَيْلَةِ") is the model
  // catching part of it, not another word.
  if (st === "wrong") return isQuranWord(heard) && 2 * heard.length > expected.length ? "wrong" : "unclear";
  if (st !== "close") return st;
  // Alike on paper only through the article they share (with "و", "ف", "ب"
  // or "ل" before it): "ٱلْوَٰحِدُ" for "ٱلصَّمَدُ", "وَٱلْقَمَرِ" for
  // "وَٱلشَّمْسِ" are other words, not slips.
  // After a particle and the article, three letters or more in both: two
  // ("والاد" for "وَٱلْأَرْضِ") are too few to tell another word from the
  // model's spelling.
  const rest = (a: string) => (a === "ال" ? 2 : 3);
  const pre = ARTICLES.find((a) => heard.startsWith(a) && expected.startsWith(a) && heard.length >= a.length + rest(a) && expected.length >= a.length + rest(a));
  if (pre && isQuranWord(heard) && wordSim(heard.slice(pre.length), expected.slice(pre.length)) < CLOSE) return "wrong";
  return st;
}

/** The article and the particles that join it, longest first. */
const ARTICLES = ["وال", "فال", "بال", "كال", "لل", "ال"];

/** Best status of every word some piece covered, plus what was heard for it. */
export interface Mark {
  status: WordStatus;
  heard: string | null;
  /** Said with another short vowel than the text has (letters right). */
  vowel?: VowelSlip;
  /** How alike the heard word was (0 for a skipped word). */
  sim: number;
  piece: number;
  corrected: boolean;
}

export function bestMarks(state: FollowState): Map<number, Mark> {
  const out = new Map<number, Mark>();
  const everWrong = new Set<number>();
  state.pieces.forEach((p, pi) => {
    if (p.kind !== "aligned" || !p.align) return;
    for (const pair of p.align.pairs) {
      const heard = p.tokens.slice(pair.heard, pair.heardEnd).join(" ");
      const one = pair.heardEnd - pair.heard === 1 && pair.refEnd - pair.ref === 1;
      // A word the model split in two ("لو ضروا") or two it ran together is
      // judged as one: wrong only if, put together, it is a word at all.
      const joined = statusOfSim(pair.sim);
      let st: WordStatus = one
        ? statusOfPair(heard, state.ref.norm[pair.ref], pair.sim)
        : joined === "wrong" && !isQuranWord(heard.replace(/ /g, ""))
          ? "unclear"
          : joined;
      // Letters right, a vowel wrong. The vowel model, when it judges this
      // attempt; else the vowels the listening model wrote. Never at a pause,
      // where the ending is not voiced (waqf).
      let said = heard;
      let vowel: VowelSlip | undefined;
      const lettersRight = st === "correct" || st === "close";
      if (state.vowels) {
        const v = lettersRight && pair.refEnd - pair.ref === 1 ? state.vowels.pieces.get(p.input.id)?.get(pair.ref) : undefined;
        if (v) {
          st = "wrong";
          said = v.said;
          vowel = v.slip;
        }
      } else if (one && lettersRight && p.input.words?.length) {
        const raw = p.input.words[p.tokenWord[pair.heard]]?.text ?? "";
        const k = pair.ref;
        const paused = pair === p.align.pairs[p.align.pairs.length - 1] || k + 1 >= state.ref.norm.length || state.ref.ayah[k + 1] !== state.ref.ayah[k];
        const slip = raw ? vowelSlip(raw, state.ref.uthmani[k], paused) : null;
        if (slip) {
          st = "wrong";
          said = raw;
          vowel = slip;
        }
      }
      for (let k = pair.ref; k < pair.refEnd; k++) {
        if (st === "wrong") everWrong.add(k);
        const prev = out.get(k);
        if (!prev || RANK[st] > RANK[prev.status]) {
          // Said wrong once, right later (in any number of steps): corrected.
          out.set(k, { status: st, heard: said, vowel, sim: pair.sim, piece: pi, corrected: st !== "wrong" && everWrong.has(k) });
        }
      }
    }
    for (const k of p.align.skipped) {
      if (!out.has(k)) out.set(k, { status: "missing", heard: null, sim: 0, piece: pi, corrected: false });
    }
  });
  return out;
}

/** The cursor as a word index inside the practised range (for the screen). */
export function liveCursor(state: FollowState): number {
  return Math.max(state.start, Math.min(state.end, state.live));
}

export { spoken };
