// How alike two recited words are, judged on the letters that are spoken.
//
// The Quran is printed in Uthmani spelling and the model writes modern
// spelling, so the same spoken word can differ in its long-vowel letters
// (ٱلصَّلَوٰةَ / الصلاة, ذَٰلِكَ / ذالك, إِبْرَٰهِيمَ / إبراهيم) and its hamza seat.
// Those letters are cheap to add, drop or swap here. The article before a sun
// letter is silent ("ٱلصَّمَدُ" sounds "ṣṣamad"), so it may be missing from
// what was heard. Letters that sound alike (ص and س, ح and ه: the recogniser
// writes one for the other, and a learner says one for the other) cost half,
// but can lift a word only to "nearly right", never to "right". Every other
// letter costs in full. One changed letter in a long word can still pass as
// right (الالمين for العالمين): the judgement is on letters, not sound.

import { normalizeWord } from "@/lib/arabic";

/** Long vowels and hamza: spelled differently between scripts, same sound. */
const SOFT = new Set(["ا", "و", "ي", "ء"]);
const SOFT_INDEL = 0.4;
const SOFT_SUB = 0.3;

/** A word as compared: normalised letters only (diacritics, tatweel, marks gone). */
export function spoken(word: string): string {
  return normalizeWord(word);
}

/** The letters without the soft ones — a looser key for finding a place in the text. */
export function skeleton(norm: string): string {
  let out = "";
  for (const ch of norm) if (!SOFT.has(ch)) out += ch;
  return out.endsWith("ه") ? out.slice(0, -1) : out;
}

/**
 * Similarity in [0, 1] of two normalised words: weighted edit distance over
 * the longer length. 1 = the same spoken word.
 */
export function wordSim(a: string, b: string): number {
  if (a === b) return 1;
  const strict = articleSim(a, b, false);
  const near = articleSim(a, b, true);
  // A sound-alike letter makes a word nearly right at most: ح for ه is the
  // recogniser's spelling or the learner's makhraj, and neither is "right".
  return near > strict ? Math.max(strict, Math.min(near, NEAR_CAP)) : strict;
}

function articleSim(a: string, b: string, near: boolean): number {
  const artA = a.length > 3 && a.startsWith("ال");
  const artB = b.length > 3 && b.startsWith("ال");
  // Before a sun letter the article is not heard, so a heard word without it
  // is compared with the rest ("سمد" for "الصمد"). Only where the rest is a
  // word of its own: "الله" is not "ال" + "له".
  if (artA !== artB) {
    const [art, bare] = artA ? [a, b] : [b, a];
    const rest = art.slice(2);
    if (SUN.has(rest[0]) && rest.length >= 3 && bare.length >= 3) return Math.max(levSim(a, b, near), levSim(rest, bare, near));
  }
  return levSim(a, b, near);
}

/** Letters after which the article's lām is assimilated (silent). */
const SUN = new Set(["ت", "ث", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ل", "ن"]);

/** Pairs that sound alike: emphatic and plain, and voiced and unvoiced at a stop. */
const NEAR = new Set(["سص", "سث", "تط", "دض", "دت", "ذز", "ذظ", "زظ", "ضظ", "قك", "حه"].flatMap((p) => [p, p[1] + p[0]]));
const NEAR_SUB = 0.5;

function levSim(a: string, b: string, near: boolean): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  prev[0] = 0;
  for (let j = 1; j <= n; j++) prev[j] = prev[j - 1] + (SOFT.has(b[j - 1]) ? SOFT_INDEL : 1);
  for (let i = 1; i <= m; i++) {
    const ai = a[i - 1];
    const delA = SOFT.has(ai) ? SOFT_INDEL : 1;
    curr[0] = prev[0] + delA;
    for (let j = 1; j <= n; j++) {
      const bj = b[j - 1];
      const sub = ai === bj ? 0 : SOFT.has(ai) && SOFT.has(bj) ? SOFT_SUB : near && NEAR.has(ai + bj) ? NEAR_SUB : 1;
      const insB = SOFT.has(bj) ? SOFT_INDEL : 1;
      curr[j] = Math.min(prev[j - 1] + sub, prev[j] + delA, curr[j - 1] + insB);
    }
    [prev, curr] = [curr, prev];
  }
  return Math.max(0, 1 - prev[n] / Math.max(m, n));
}

/** At or above: the word was said right. */
export const CORRECT = 0.84;
/** At or above: nearly right (a slip, or the recogniser's spelling). */
export const CLOSE = 0.6;
/** The most a sound-alike letter can leave a word at: just under right. */
const NEAR_CAP = CORRECT - 0.005;
