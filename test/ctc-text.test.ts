// The vowel model's spelling of every word, lined up with Dugsi's Uthmani text
// (lib/quran/ctc/*.json, written by scripts/build-ctc-text.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSurah } from "../lib/quran";
import { alignSpellings, loadCtcText } from "../lib/quran/ctc-text";
import { editDistance, normalizeWord } from "../lib/arabic";
import { modernSpelling, spellingKey } from "../lib/follow/spelling";

const keyU = (w: string) =>
  spellingKey(normalizeWord(modernSpelling(w.replace(/\u0649\u0670(?=\p{L})/gu, "ا").replace(/\u06E6(?=[\u064B-\u0652])/g, "ي"))));
const keyM = (w: string) => spellingKey(normalizeWord(w));
const MUQATTAAT = new Set(["الم", "المص", "الر", "المر", "كهيعص", "طه", "طسم", "طس", "يس", "ص", "حم", "عسق", "ق", "ن"]);

test("every Uthmani word of the Quran has its model spelling, and it is the same word", async () => {
  let words = 0;
  let joins = 0;
  const empties: string[] = [];
  for (let id = 1; id <= 114; id++) {
    const surah = await loadSurah(id);
    const ctc = await loadCtcText(id);
    assert.equal(ctc.length, surah.ayat.length, `surah ${id} verses`);
    surah.ayat.forEach((ayah, v) => {
      assert.equal(ctc[v].length, ayah.words.length, `${id}:${ayah.number} words`);
      ayah.words.forEach((w, i) => {
        words++;
        const m = ctc[v][i];
        if (m === "") {
          empties.push(`${id}:${ayah.number}:${i}`);
          return;
        }
        if (m.includes(" ")) joins++;
        // The model's text has full vowel marks, but for the disjoint letters.
        if (!MUQATTAAT.has(m)) assert.match(m, /[\u064B-\u0652]/, `${id}:${ayah.number} ${m}`);
        const a = keyU(w.uthmani + (ctc[v][i + 1] === "" ? ayah.words[i + 1].uthmani : ""));
        const b = m.split(" ").map(keyM).join("");
        const d = editDistance(a, b);
        assert.ok(d <= 1 || d / Math.max(a.length, b.length) <= 0.4, `${id}:${ayah.number} ${w.uthmani} ≠ ${m}`);
      });
    });
  }
  assert.equal(words, 77429);
  assert.equal(joins, 371); // يَٰقَوۡمِ = يَا قَوْمِ and the like
  assert.deepEqual(empties, ["2:72:4"]); // فَٱدَّـٰرَ ٰٔتُمۡ is one model word, فَادَّارَأْتُمْ
});

test("a join only where the word counts force one", () => {
  // 58:2 … إِلَّا ٱلَّـٰٓـِٔي وَلَدۡنَهُمۡ: a cheap join once paired إِلَّا with اللَّائِي.
  assert.deepEqual(alignSpellings(["أُمَّهَٰتُهُمۡ", "إِلَّا", "ٱلَّـٰٓـِٔي"], ["أُمَّهَاتُهُمْ", "إِلَّا", "اللَّائِي"]), [
    "أُمَّهَاتُهُمْ",
    "إِلَّا",
    "اللَّائِي",
  ]);
  assert.deepEqual(alignSpellings(["قَالَ", "يَٰمُوسَىٰٓ"], ["قَالَ", "يَا", "مُوسَى"]), ["قَالَ", "يَا مُوسَى"]);
  assert.equal(alignSpellings(["قَالَ"], ["مُوسَى"]), null);
});
