// The reference the reciter is followed against: one surah (or a practice
// range of it), flattened to words in recitation order, with an index for
// finding a place in it fast.

import type { Ayah } from "@/lib/quran/types";
import { skeleton, spoken } from "./phonetic";

export interface RefText {
  /** Normalised spoken form of every word, in order. */
  norm: string[];
  /** Every word as printed (Uthmani, with its vowel marks). */
  uthmani: string[];
  /** Verse number of each word. */
  ayah: number[];
  /** Position of each word inside its verse (0-based). */
  inAyah: number[];
  /** Index of the first word of each verse number. */
  verseFirst: Map<number, number>;
  /** "w1 w2" (exact) and "~s1 s2" (skeletons) → word indices where the pair starts. */
  pairs: Map<string, number[]>;
}

export function buildRef(ayat: Ayah[]): RefText {
  const norm: string[] = [];
  const uthmani: string[] = [];
  const ayah: number[] = [];
  const inAyah: number[] = [];
  const verseFirst = new Map<number, number>();
  for (const a of ayat) {
    verseFirst.set(a.number, norm.length);
    a.words.forEach((w, i) => {
      norm.push(spoken(w.uthmani));
      uthmani.push(w.uthmani);
      ayah.push(a.number);
      inAyah.push(i);
    });
  }
  const pairs = new Map<string, number[]>();
  const add = (k: string, i: number) => {
    const list = pairs.get(k);
    if (list) list.push(i);
    else pairs.set(k, [i]);
  };
  for (let i = 0; i + 1 < norm.length; i++) {
    add(`${norm[i]} ${norm[i + 1]}`, i);
    add(`~${skeleton(norm[i])} ${skeleton(norm[i + 1])}`, i);
  }
  return { norm, uthmani, ayah, inAyah, verseFirst, pairs };
}
