import { test } from "node:test";
import assert from "node:assert/strict";
import meta from "../lib/quran/surahs-meta.json";
import ikhlas from "../lib/quran/data/112.json";
import nas from "../lib/quran/data/114.json";
import { tokenize } from "../lib/arabic";

const norm = (s: string) => tokenize(s).join(" ");

test("the corpus has all 114 surahs with sane metadata", () => {
  assert.equal(meta.length, 114);
  assert.equal(meta[0].id, 1);
  assert.equal(meta[113].id, 114);
  for (const m of meta) {
    assert.ok(m.ayahCount > 0, `surah ${m.id} has no verses`);
    assert.ok(m.transliteration.length > 0);
    assert.ok(m.nameArabic.length > 0);
  }
});

test("a generated short surah is correct (Al-Ikhlas, An-Nas)", () => {
  assert.equal(ikhlas.id, 112);
  assert.equal(ikhlas.verses.length, 4);
  assert.ok(norm(ikhlas.verses[0].text).startsWith("قل هو الله"), "112:1");

  assert.equal(nas.id, 114);
  assert.equal(nas.verses.length, 6);
  assert.ok(norm(nas.verses[0].text).startsWith("قل اعوذ برب الناس"), "114:1");
});
