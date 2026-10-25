// The spelling keys of every word of the Quran, sorted. Used to build and to
// check lib/follow/lexicon-data.json (Node only; the app reads the file).
import { loadSurah } from "@/lib/quran";
import { normalizeWord } from "@/lib/arabic";
import { spellingKey } from "./spelling";

/**
 * The word as modern script writes it: the dagger alif written out
 * (ٱلصِّرَٰطَ → الصراط), the waw that carries it read as alif
 * (ٱلصَّلَوٰةَ → الصلاة), the small yeh written (إِبْرَٰهِـۧمَ → إبراهيم).
 */
export function modernSpelling(uthmani: string): string {
  return uthmani.replace(/وٰ/g, "ا").replace(/ىٰ/g, "ى").replace(/ٰ/g, "ا").replace(/ۧ/g, "ي");
}

export async function quranSpellingKeys(): Promise<string[]> {
  const keys = new Set<string>();
  for (let s = 1; s <= 114; s++)
    for (const a of (await loadSurah(s)).ayat)
      for (const w of a.words) {
        keys.add(spellingKey(normalizeWord(w.uthmani)));
        keys.add(spellingKey(normalizeWord(modernSpelling(w.uthmani))));
      }
  keys.delete("");
  return [...keys].sort();
}
