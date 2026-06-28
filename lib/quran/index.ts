import type { Surah, Ayah, Word } from "./types";
import { fatiha } from "./fatiha";
import { wordRules, wordMadd } from "@/lib/tajweed/engine";
import META from "./surahs-meta.json";

export type { Surah, Ayah, Word, RuleId } from "./types";
export { flattenWords, flattenAyat } from "./types";

export interface SurahMeta {
  id: number;
  name: string;
  nameArabic: string;
  transliteration: string;
  ayahCount: number;
  type: string;
  /** Whether per-word tajweed colouring is available for this surah. */
  hasTajweed: boolean;
}

export const SURAHS: SurahMeta[] = (META as Omit<SurahMeta, "hasTajweed">[]).map((m) => ({
  ...m,
  hasTajweed: true, // Al-Fatiha is hand-tagged; every other surah is auto-tagged
}));

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
      .map((t): Word => {
        const rules = wordRules(t);
        const madd = wordMadd(rules);
        return madd ? { uthmani: t, rules, madd } : { uthmani: t, rules };
      }),
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
 * every other surah is loaded on demand so the initial download stays tiny.
 */
export async function loadSurah(id: number): Promise<Surah> {
  if (id === 1) return fatiha;
  const mod = await import(`./data/${id}.json`);
  return buildSurah(mod.default as unknown as RawSurah);
}
