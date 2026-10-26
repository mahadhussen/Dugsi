// The short vowels a reciter gave each letter, as the model wrote them —
// fatha, damma, kasra — compared with the text's.
//
// The Quran model writes what it hears with its vowel marks: "الْحَمْدَ" when
// the reciter said al-ḥamda for ٱلْحَمْدُ, "رَبُ" for rabbu instead of rabbi
// (measured, test/harakat.test.ts). That makes a wrong vowel a mistake Dugsi
// can show, as long as only what the model is sure of is compared:
//   • only a short vowel against a different short vowel (a, u, i) on the same
//     consonant — never a mark the model left out, never sukun, never shadda
//     (it drops shadda on right readings: "لِلَهِ", "رَبِ");
//   • never the last letter of a word the reciter paused after: at a pause the
//     ending is not voiced (waqf), so what the model writes there means nothing;
//   • never a long-vowel letter (ا و ي), which carries no short vowel.

import { normalizeWord } from "@/lib/arabic";

export type Vowel = "a" | "u" | "i";

/** One letter of a word with the mark written on it: a short vowel, sukun
 *  ("0"), or nothing. */
interface Letter {
  ch: string;
  mark: Vowel | "0" | null;
}

const MARK: Record<string, Vowel | "0"> = {
  "\u064E": "a", // fatha
  "\u064B": "a", // fathatan
  "\u08F0": "a", // open fathatan (Uthmani)
  "\u064F": "u", // damma
  "\u064C": "u", // dammatan
  "\u08F1": "u", // open dammatan
  "\u0650": "i", // kasra
  "\u064D": "i", // kasratan
  "\u08F2": "i", // open kasratan
  "\u0652": "0", // sukun
  "\u06E1": "0", // sukun (Uthmani)
};

const SOFT = new Set(["ا", "و", "ي"]);
const GLIDE = new Set(["و", "ي"]);

/** The letters of a word (normalised as the follower compares them), each with
 *  the mark written on it. */
export function lettersOf(word: string): Letter[] {
  const out: Letter[] = [];
  for (const raw of word.normalize("NFC")) {
    const m = MARK[raw];
    if (m) {
      const last = out[out.length - 1];
      if (last) last.mark = m;
      continue;
    }
    const ch = normalizeWord(raw);
    if (ch.length === 1) out.push({ ch, mark: null });
  }
  return out;
}

/** The consonants of a word: every letter but a long vowel (ا, و, ي with no
 *  mark of its own; with a mark it is hamza, w or y), each with its mark and
 *  whether a long vowel follows it (then its vowel is the long vowel's). */
function consonants(word: string): { ch: string; mark: Letter["mark"]; long: boolean }[] {
  const ls = lettersOf(word);
  const out: { ch: string; mark: Letter["mark"]; long: boolean }[] = [];
  for (const l of ls) {
    if (SOFT.has(l.ch) && !l.mark) {
      if (out.length) out[out.length - 1].long = true;
      continue;
    }
    out.push({ ch: l.ch, mark: l.mark, long: false });
  }
  return out;
}

export interface VowelSlip {
  /** Position of the consonant in the text word (0-based). */
  at: number;
  /** The vowel the text has, and the one heard. */
  want: Vowel;
  heard: Vowel;
  /** The slip is on the word's ending (its last consonant). */
  ending: boolean;
}

/**
 * Where the reciter gave a consonant another short vowel than the text has,
 * or null. `paused`: the reciter stopped after this word, so its ending is
 * not voiced (waqf) and not judged. Consonants are lined up only where both
 * words have the same ones in the same order; a word whose letters differ is
 * a matter for the letter comparison. A consonant before a long vowel is not
 * judged: its vowel is the long vowel's, and the model misplaces it there.
 */
export function vowelSlip(heardWord: string, textWord: string, paused: boolean, endings = true): VowelSlip | null {
  const h = consonants(heardWord);
  const t = consonants(textWord);
  // و and ي are one place in the word: a wrong vowel before y makes it sound
  // w ("إِلُوَّكَ" heard for إِلَيْكَ said with lu-).
  const same = (a: string, b: string) => a === b || (GLIDE.has(a) && GLIDE.has(b));
  if (h.length !== t.length || h.some((l, k) => !same(l.ch, t[k].ch))) return null;
  const last = t.length - 1;
  for (let k = 0; k < t.length; k++) {
    if (k === last && (paused || !endings)) continue;
    if (t[k].long || h[k].long) continue;
    const want = t[k].mark;
    const heard = h[k].mark;
    if (want && want !== "0" && heard && heard !== "0" && want !== heard) return { at: k, want, heard, ending: k === last };
  }
  return null;
}
