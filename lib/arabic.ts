// Arabic text utilities for comparing recited Quran against the reference text.
//
// Speech-to-text returns plain Arabic without the precise Uthmani orthography
// (diacritics, special alef forms, tatweel, etc.). To compare fairly we strip
// everything that does not change the *spoken* word and normalise letter
// variants that sound identical.

// Arabic diacritics / harakat (fatha, damma, kasra, shadda, sukun, tanwin,
// superscript alef, small high marks used in the Mushaf, etc.)
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿ]/g;

// Tatweel (kashida) — purely cosmetic letter stretching.
const TATWEEL = /ـ/g;

// Quranic annotation signs and pause marks that are not pronounced as letters.
const QURANIC_MARKS = /[۝۞۩۔]/g;

/**
 * Normalise a single Arabic word for comparison.
 * - removes diacritics, tatweel and quranic annotation marks
 * - unifies the different alef forms (إ أ آ ٱ) to bare alef ا
 * - unifies alef maqsura ى -> ي and ta marbuta ة -> ه
 * - unifies the various hamza carriers to a bare hamza where it stands alone
 * - collapses the standalone "Allah" ligature spellings
 */
export function normalizeWord(input: string): string {
  if (!input) return "";
  let s = input.normalize("NFC");

  s = s.replace(DIACRITICS, "");
  s = s.replace(TATWEEL, "");
  s = s.replace(QURANIC_MARKS, "");

  // Unify alef variants (hamza-on-alef, hamza-under-alef, madda, wasla) to bare alef.
  s = s.replace(/[آأإٱ]/g, "ا");
  // Alef maqsura -> ya (they are pronounced the same in most recitation contexts).
  s = s.replace(/ى/g, "ي");
  // Ta marbuta -> ha (final -a/-ah sound).
  s = s.replace(/ة/g, "ه");
  // Hamza on waw / ya carriers -> bare hamza.
  s = s.replace(/[ؤئ]/g, "ء");

  // Remove any remaining non-Arabic-letter characters (latin, punctuation, digits).
  s = s.replace(/[^ء-ي]/g, "");

  return s.trim();
}

/** Split a line of Arabic into spoken word tokens (normalisation applied). */
export function tokenize(line: string): string[] {
  return line
    .split(/\s+/)
    .map((w) => normalizeWord(w))
    .filter((w) => w.length > 0);
}

/** Levenshtein edit distance between two strings (used for fuzzy word match). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Similarity in [0,1] based on normalised edit distance. */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const dist = editDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}
