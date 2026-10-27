// Wrong short vowels, judged from the sound itself.
//
// The listening model (Whisper) writes what it expects as much as what it
// hears: trained on correct recitations only, it "corrects" a slip back to
// the text, so it caught about half of deliberate vowel mistakes. A CTC model
// has no language model behind it. For each word the reciter said, we ask it:
// does the audio fit the text better with this vowel, or with another one?
//   margin = nll(text) − nll(text with one vowel changed)
// A clear positive margin means the reciter said the other vowel. Measured on
// 49 deliberate mistakes and 892 vowels from four masters' Al-Fatiha
// (WORKLOG, round 6): mistakes score 6.6–13.6, right vowels stay below 3.1.
//
// What is never judged, the same as lib/follow/harakat.ts:
//   • the ending of a word the reciter paused after (waqf: not voiced);
//   • a consonant before a long vowel (its vowel is the long vowel's);
//   • a letter with a dagger alif (ٰ), which is a long vowel too.

import { normalizeWord } from "@/lib/arabic";
import { ctcAlign, ctcNll, greedy, type LogProbs } from "./ctc";
import type { Vowel } from "./harakat";

export interface CtcVocab {
  /** letter → model token id */
  ids: Readonly<Record<string, number>>;
  blank: number;
  /** the word delimiter token ("|") */
  delimiter: number;
}

/** Seconds per CTC frame (wav2vec2: 20 ms). */
export const FRAME_SECONDS = 0.02;
/** A silence this long after a word is a pause: its ending is not judged. */
export const PAUSE_SECONDS = 0.25;
/**
 * A margin above this is a wrong vowel. Measured (WORKLOG, round 6): every
 * deliberate mistake the audio held scored 6.6 or more; no right vowel of
 * 2 790 (four masters, echo, noise, a classroom) scored above 3.1.
 */
export const VOWEL_MARGIN = 5;

const SHORT: Record<string, Vowel> = { "َ": "a", "ُ": "u", "ِ": "i" };
const MARK_OF: Record<Vowel, string> = { a: "َ", u: "ُ", i: "ِ" };
// Any vowel or sukun mark (as in harakat.ts): a letter that carries one is not
// a long vowel.
const VOWEL_OR_SUKUN = new Set([
  "َ", "ً", "ࣰ", "ُ", "ٌ", "ࣱ", "ِ", "ٍ", "ࣲ", "ْ", "ۡ",
]);
const SHADDA = "ّ";
const DAGGER_ALIF = "ٰ";
const TATWEEL = "ـ";
// Uthmani forms the model's text writes otherwise.
const SPELL: Record<string, string> = { "ۡ": "ْ", "ࣰ": "ً", "ࣱ": "ٌ", "ࣲ": "ٍ" };

const isMark = (c: string) => c === TATWEEL || /\p{Mn}/u.test(c);

function baseLetter(c: string): string {
  if ("آأإٱ".includes(c)) return "ا";
  if (c === "ى") return "ي";
  return c;
}

/** The letters of a written word, each with the indices of its marks. */
function bases(w: string): { at: number; marks: number[] }[] {
  const out: { at: number; marks: number[] }[] = [];
  for (let i = 0; i < w.length; i++) {
    if (isMark(w[i])) {
      out.at(-1)?.marks.push(i);
      continue;
    }
    out.push({ at: i, marks: [] });
  }
  return out;
}

export interface VowelSlot {
  /** letter position in the word (0-based) */
  base: number;
  /** index of the vowel mark in the word string */
  idx: number;
  vowel: Vowel;
  ending: boolean;
}

/** The short vowels of a word that can be judged. */
export function vowelSlots(word: string, paused: boolean): VowelSlot[] {
  const bs = bases(word);
  const out: VowelSlot[] = [];
  bs.forEach((b, k) => {
    const vm = b.marks.filter((m) => SHORT[word[m]]);
    if (!vm.length) return;
    if (b.marks.some((m) => word[m] === DAGGER_ALIF)) return;
    const next = bs[k + 1];
    if (next) {
      const marked = next.marks.some((m) => VOWEL_OR_SUKUN.has(word[m]));
      if ("اوي".includes(baseLetter(word[next.at])) && !marked) return;
    } else if (paused) return;
    out.push({ base: k, idx: vm[0], vowel: SHORT[word[vm[0]]], ending: k === bs.length - 1 });
  });
  return out;
}

/** Token ids of the words, with which word each token belongs to (−1: delimiter). */
export function encodeWords(words: readonly string[], vocab: CtcVocab): { ids: number[]; owner: number[] } {
  const ids: number[] = [];
  const owner: number[] = [];
  words.forEach((w, wi) => {
    if (wi) {
      ids.push(vocab.delimiter);
      owner.push(-1);
    }
    // The model writes shadda before the vowel, as its training text does.
    for (const c of w.replace(/([ً-ِ])ّ/g, `${SHADDA}$1`)) {
      const id = vocab.ids[SPELL[c] ?? c];
      if (id !== undefined) {
        ids.push(id);
        owner.push(wi);
      }
    }
  });
  return { ids, owner };
}

export interface VowelMargin {
  word: number;
  base: number;
  want: Vowel;
  alt: Vowel;
  ending: boolean;
  margin: number;
  /** The word written with the other vowel: what the reciter said. */
  said: string;
}

/**
 * How much better the audio fits each word with one short vowel changed.
 * `words` must be exactly what the audio holds, in the model's spelling
 * (with full vowel marks); the caller makes sure of that.
 */
export function vowelMargins(
  lp: LogProbs,
  words: readonly string[],
  vocab: CtcVocab,
  only?: ReadonlySet<number>,
): VowelMargin[] {
  const { ids, owner } = encodeWords(words, vocab);
  const base = ctcNll(lp, ids, vocab.blank);
  if (!Number.isFinite(base)) return [];
  const path = ctcAlign(lp, ids, vocab.blank);
  if (!path) return [];
  // first/last frame of each word
  const span = words.map((_, wi) => {
    let f = Infinity;
    let l = -Infinity;
    owner.forEach((o, k) => {
      if (o === wi && path.first[k] >= 0) {
        f = Math.min(f, path.first[k]);
        l = Math.max(l, path.last[k]);
      }
    });
    return { f, l };
  });
  const paused = (wi: number) =>
    wi === words.length - 1 || (span[wi + 1].f - span[wi].l) * FRAME_SECONDS >= PAUSE_SECONDS || !Number.isFinite(span[wi].l);
  const out: VowelMargin[] = [];
  words.forEach((w, wi) => {
    if (only && !only.has(wi)) return;
    for (const s of vowelSlots(w, paused(wi))) {
      for (const alt of ["a", "u", "i"] as Vowel[]) {
        if (alt === s.vowel) continue;
        const changed = w.slice(0, s.idx) + MARK_OF[alt] + w.slice(s.idx + 1);
        const alts = words.map((x, j) => (j === wi ? changed : x));
        const nll = ctcNll(lp, encodeWords(alts, vocab).ids, vocab.blank);
        out.push({ word: wi, base: s.base, want: s.vowel, alt, ending: s.ending, margin: base - nll, said: changed });
      }
    }
  });
  return out;
}

export interface VowelFinding {
  word: number;
  /** letter position in the word */
  base: number;
  want: Vowel;
  heard: Vowel;
  ending: boolean;
  margin: number;
  said: string;
}

/** The words the model heard, read straight off the frames. */
export function heardWords(lp: LogProbs, vocab: CtcVocab): string[] {
  const letter = new Map<number, string>();
  for (const [ch, id] of Object.entries(vocab.ids)) if ([...ch].length === 1) letter.set(id, ch);
  let s = "";
  for (const id of greedy(lp, vocab.blank)) s += id === vocab.delimiter ? " " : (letter.get(id) ?? "");
  return s.split(/\s+/).filter(Boolean);
}

/** 2·LCS(letters) / (length a + length b): 1 for the same letters, 0 for none shared. */
export function likeness(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const D = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) D[i][j] = a[i] === b[j] ? D[i + 1][j + 1] + 1 : Math.max(D[i + 1][j], D[i][j + 1]);
  return (2 * D[0][0]) / (a.length + b.length);
}

/**
 * A heard word this alike to a text word is that word. Measured: 0.75 lost
 * three real mistakes the model spelled far off (طَرَقَ for الطَّارِقُ said
 * wrong); 0.6 paired an echoed "أو" with أعوذ (a margin of 4.5).
 */
export const SAME_WORD = 0.7;

/**
 * Which heard word is which text word: an edit-distance alignment over the
 * letter-only words, pairing words at least SAME_WORD alike. Not exact
 * letters: a wrong vowel often changes how the model spells the word
 * (فِيهَ said, فِيهَا written). Not a heard word that is two text words run
 * together. Heard index → text index.
 */
export function heardPairs(heard: readonly string[], words: readonly string[]): Map<number, number> {
  const h = heard.map(normalizeWord);
  const r = words.map(normalizeWord);
  const n = h.length;
  const m = r.length;
  const L = Array.from({ length: n }, (_, i) => r.map((w) => likeness(h[i], w)));
  const D = Array.from({ length: n + 1 }, (_, i) => Float64Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (1 - L[i - 1][j - 1]) * 2);
  // Two text words the model ran together ("نَسْتَعِياهْدِنَا") are no one
  // text word: paired, the other's sound would have to be explained by this
  // word's ending (a margin of 10.9 on a master's right reading).
  const merged = (i: number, j: number) =>
    (j > 0 && likeness(h[i], r[j - 1] + r[j]) > L[i][j]) || (j + 1 < m && likeness(h[i], r[j] + r[j + 1]) > L[i][j]);
  const out = new Map<number, number>();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const like = L[i - 1][j - 1];
    if (Math.abs(D[i][j] - (D[i - 1][j - 1] + (1 - like) * 2)) < 1e-9) {
      if (like >= SAME_WORD && !merged(i - 1, j - 1)) out.set(i - 1, j - 1);
      i--;
      j--;
    } else if (Math.abs(D[i][j] - (D[i - 1][j] + 1)) < 1e-9) i--;
    else j--;
  }
  return out;
}

/**
 * The wrong vowels in a stretch of recitation, judged in the context of what
 * was heard: the audio is scored against the heard words, with each heard
 * word that is a text word written as the text has it, and only those are
 * judged. A word of the text that was not said (a basmala left out scored 8
 * to 12 against the full text), or speech that is not in the text (an
 * isti'adha, a repeat), then cannot make a vowel look wrong. Findings are by
 * text word index.
 */
export function judgeVowels(lp: LogProbs, words: readonly string[], vocab: CtcVocab, threshold = VOWEL_MARGIN): VowelFinding[] {
  const heard = heardWords(lp, vocab);
  const pairs = heardPairs(heard, words);
  const target = heard.map((h, i) => {
    const j = pairs.get(i);
    return j === undefined ? h : words[j];
  });
  const margins = vowelMargins(lp, target, vocab, new Set(pairs.keys())).map((m) => ({ ...m, word: pairs.get(m.word)! }));
  return vowelFindings(margins, threshold);
}

/** A margin row, with or without the said word (the Python facit has none). */
type MarginLike = Omit<VowelMargin, "said"> & { said?: string };

/** The clearest wrong vowel in each word, if any is above the margin. */
export function vowelFindings(margins: readonly MarginLike[], threshold = VOWEL_MARGIN): VowelFinding[] {
  const best = new Map<number, MarginLike>();
  for (const m of margins) {
    if (m.margin <= threshold) continue;
    const b = best.get(m.word);
    if (!b || m.margin > b.margin) best.set(m.word, m);
  }
  return [...best.values()]
    .sort((x, y) => x.word - y.word)
    .map((m) => ({ word: m.word, base: m.base, want: m.want, heard: m.alt, ending: m.ending, margin: m.margin, said: m.said ?? "" }));
}
