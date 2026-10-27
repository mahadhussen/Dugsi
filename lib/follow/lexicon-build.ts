// The spelling keys of every word of the Quran, sorted. Used to build and to
// check lib/follow/lexicon-data.json (Node only; the app reads the file).
import { loadSurah } from "@/lib/quran";
import { normalizeWord } from "@/lib/arabic";
import { modernSpelling, spellingKey } from "./spelling";

export { modernSpelling };

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
