import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { quranSpellingKeys, modernSpelling } from "../lib/follow/lexicon-build";
import { isQuranWord } from "../lib/follow/lexicon";
import { spoken } from "../lib/follow/phonetic";

test("the word list is built from the locked Quran text (rebuild: npx tsx scripts/build-lexicon.ts)", async () => {
  const onDisk = JSON.parse(readFileSync("lib/follow/lexicon-data.json", "utf8"));
  assert.deepEqual(onDisk, await quranSpellingKeys());
});

test("modern spelling writes out what Uthmani leaves to small marks", () => {
  assert.equal(spoken(modernSpelling("ٱلصِّرَٰطَ")), "الصراط");
  assert.equal(spoken(modernSpelling("ٱلصَّلَوٰةَ")), "الصلاه");
  assert.equal(spoken(modernSpelling("إِبْرَٰهِـۧمَ")), "ابراهيم");
});

test("a word of the Quran is known in either spelling; letters that are no word are not", () => {
  for (const w of ["بالحق", "الخاسرون", "الواحد", "الصلاة", "آمنوا", "القرآن", "إبراهيم", "يسألون", "موسى"]) {
    assert.ok(isQuranWord(spoken(w)), w);
  }
  for (const w of ["ولغر", "ونظ", "العمسان", "سمت", "معصره", "حتامت"]) {
    assert.ok(!isQuranWord(spoken(w)), w);
  }
});
