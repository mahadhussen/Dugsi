// Writes lib/quran/ctc/{surah}.json: each word of Dugsi's Uthmani text in the
// spelling the vowel model was trained on (simple script with full vowel
// marks, from the model's own quran_text.txt). The vowel judge scores the
// audio against these words; the app still shows the Uthmani.
//
// Usually one model word per Uthmani word. Where Uthmani joins what simple
// script writes apart (يَٰمُوسَىٰٓ = يَا مُوسَى, يَبۡنَؤُمَّ = يَا ابْنَ أُمَّ), the
// model words are kept together, separated by a space.
//
//   curl -L -o /tmp/quran_text.txt \
//     https://huggingface.co/rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final/resolve/b03a268c6ba1a693752307325ab376c86c3b12da/quran_text.txt
//   npx tsx scripts/build-ctc-text.ts /tmp/quran_text.txt
// test/ctc-text.test.ts checks every surah against the app's text.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadSurah } from "../lib/quran";
import { alignSpellings } from "../lib/quran/ctc-text";

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error("usage: build-ctc-text.ts quran_text.txt");
  const byVerse = new Map<string, string[]>();
  for (const line of readFileSync(src, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const [s, a, text] = line.split("|");
    byVerse.set(`${s}:${a}`, text.trim().split(/\s+/));
  }
  mkdirSync("lib/quran/ctc", { recursive: true });
  let joined = 0;
  for (let id = 1; id <= 114; id++) {
    const surah = await loadSurah(id);
    const verses = surah.ayat.map((ayah) => {
      const model = byVerse.get(`${id}:${ayah.number}`);
      if (!model) throw new Error(`no model text for ${id}:${ayah.number}`);
      const words = alignSpellings(
        ayah.words.map((w) => w.uthmani),
        model,
      );
      if (!words) throw new Error(`cannot line up ${id}:${ayah.number}`);
      joined += words.filter((w) => w.includes(" ")).length;
      return words;
    });
    writeFileSync(`lib/quran/ctc/${id}.json`, JSON.stringify(verses) + "\n");
  }
  console.log(`114 surahs written, ${joined} Uthmani words that are two or more model words`);
}
void main();
