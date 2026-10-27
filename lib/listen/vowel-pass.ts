// The vowel judge on one piece of recitation: which text words the piece was
// placed on, in the vowel model's spelling, and its findings back on those
// words. Pure; the engine runs the model and keeps the book.

import type { LogProbs } from "@/lib/follow/ctc";
import type { CtcVowel, PieceRecord } from "@/lib/follow/follower";
import { judgeVowels, type CtcVocab } from "@/lib/follow/vowel-judge";
import { VOWEL_MODEL } from "./vowel-model";

export const VOWEL_VOCAB: CtcVocab = { ids: VOWEL_MODEL.vocab, blank: VOWEL_MODEL.blank, delimiter: VOWEL_MODEL.delimiter };

export interface PieceWords {
  /** Model-spelling words, in order. */
  words: string[];
  /** The text word (reference index) each one belongs to. */
  owner: number[];
  /** Model words that end a verse (their ending is not judged). */
  verseEnds: Set<number>;
}

/**
 * The text words a piece was laid on, in the model's spelling: from its first
 * to its last placed word, skipped words included (the heard-context judge
 * leaves out what was not said). Null when the piece was not placed.
 * `vowelWords[k]` is the model spelling of reference word k ("" when the
 * model writes it together with the word before; space-separated when Uthmani
 * joins what the model writes apart).
 */
export function pieceVowelWords(piece: PieceRecord, vowelWords: readonly string[], ayahOf: readonly number[]): PieceWords | null {
  if (piece.kind !== "aligned" || !piece.align || !piece.align.pairs.length) return null;
  const from = Math.min(...piece.align.pairs.map((p) => p.ref));
  const to = Math.max(...piece.align.pairs.map((p) => p.refEnd));
  const words: string[] = [];
  const owner: number[] = [];
  const verseEnds = new Set<number>();
  for (let k = from; k < to; k++) {
    for (const w of (vowelWords[k] ?? "").split(" ").filter(Boolean)) {
      words.push(w);
      owner.push(k);
    }
    if (words.length && owner[words.length - 1] === k && ayahOf[k + 1] !== ayahOf[k]) verseEnds.add(words.length - 1);
  }
  return words.length ? { words, owner, verseEnds } : null;
}

/** The wrong vowels the model heard in a piece's audio, by reference word. */
export function vowelsOfPiece(lp: LogProbs, piece: PieceWords, vocab: CtcVocab = VOWEL_VOCAB): Map<number, CtcVowel> {
  const out = new Map<number, CtcVowel>();
  for (const f of judgeVowels(lp, piece.words, vocab, { verseEnds: piece.verseEnds })) {
    const k = piece.owner[f.word];
    if (out.has(k)) continue; // one finding per text word (يَٰقَوۡمِ is two model words)
    // What was said: the text word's model words, the one heard wrong replaced.
    const said = piece.words.map((w, i) => (i === f.word ? f.said : w)).filter((_, i) => piece.owner[i] === k).join(" ");
    out.set(k, { slip: { at: f.base, want: f.want, heard: f.heard, ending: f.ending }, said });
  }
  return out;
}
