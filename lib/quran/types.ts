// Shared Quran data types. Tajweed metadata (rules/madd) and translations are
// optional so a surah can be added with verified text first and enriched later.

export type RuleId =
  | "sun_letter"
  | "moon_letter"
  | "madd_natural"
  | "madd_lazim"
  | "leen"
  | "lam_jalalah"
  | "tafkheem"
  | "ghunnah"
  | "shaddah"
  | "izhar";

export interface Word {
  /** Uthmani spelling with full diacritics, for display. */
  uthmani: string;
  /** Simple Latin transliteration (optional). */
  translit?: string;
  /** Prominent tajweed rules for this word (optional). */
  rules?: RuleId[];
  /** Elongation class for the madd-timing engine (optional). */
  madd?: "natural" | "lazim";
}

export interface Ayah {
  number: number;
  words: Word[];
  translit?: string;
  translation?: string;
}

export interface Surah {
  number: number;
  name: string;
  nameArabic: string;
  transliteration?: string;
  /** True when the printed text already begins with the basmala. */
  bismillah?: boolean;
  ayat: Ayah[];
}

/** All words of a surah flattened, in recitation order, with ayah index. */
export function flattenWords(surah: Surah): { word: Word; ayah: number; indexInAyah: number }[] {
  return flattenAyat(surah.ayat);
}

/** Flatten an arbitrary list of ayat (e.g. one practice section). */
export function flattenAyat(ayat: Ayah[]): { word: Word; ayah: number; indexInAyah: number }[] {
  const out: { word: Word; ayah: number; indexInAyah: number }[] = [];
  for (const ayah of ayat) {
    ayah.words.forEach((word, i) => out.push({ word, ayah: ayah.number, indexInAyah: i }));
  }
  return out;
}
