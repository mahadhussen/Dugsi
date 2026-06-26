import type { Surah, Ayah } from "./types";
import { fatiha } from "./fatiha";

export type { Surah, Ayah, Word, RuleId } from "./types";
export { flattenWords, flattenAyat } from "./types";

export interface SurahMeta {
  id: number;
  name: string;
  nameArabic: string;
  transliteration: string;
  ayahCount: number;
  /** Whether per-word tajweed colouring is available for this surah. */
  hasTajweed: boolean;
  /** How many ayat to practise per section (undefined = whole surah at once). */
  pageSize?: number;
}

export const SURAHS: SurahMeta[] = [
  {
    id: 1,
    name: "Al-Fatiha",
    nameArabic: "ٱلْفَاتِحَة",
    transliteration: "Al-Fātiḥah",
    ayahCount: 7,
    hasTajweed: true,
  },
  {
    id: 2,
    name: "Al-Baqarah",
    nameArabic: "البقرة",
    transliteration: "Al-Baqarah",
    ayahCount: 286,
    hasTajweed: false,
    pageSize: 5,
  },
];

export function surahMeta(id: number): SurahMeta | undefined {
  return SURAHS.find((s) => s.id === id);
}

interface RawSurah {
  id: number;
  name: string;
  nameArabic: string;
  transliteration: string;
  verses: { n: number; text: string; translit?: string; translation?: string }[];
}

function buildSurah(raw: RawSurah): Surah {
  const ayat: Ayah[] = raw.verses.map((v) => ({
    number: v.n,
    words: v.text
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => ({ uthmani: t })),
    translit: v.translit,
    translation: v.translation,
  }));
  return {
    number: raw.id,
    name: raw.name,
    nameArabic: raw.nameArabic,
    transliteration: raw.transliteration,
    bismillah: false,
    ayat,
  };
}

/**
 * Load a surah's full data. Al-Fatiha is bundled (it carries tajweed metadata);
 * larger surahs are loaded on demand so they don't bloat the initial download.
 */
export async function loadSurah(id: number): Promise<Surah> {
  if (id === 1) return fatiha;
  if (id === 2) {
    const mod = await import("./data/baqarah.json");
    return buildSurah(mod.default as unknown as RawSurah);
  }
  throw new Error(`Unknown surah: ${id}`);
}
