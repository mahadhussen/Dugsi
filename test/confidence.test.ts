import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRecitation } from "../lib/analyze";
import type { Ayah } from "../lib/quran/types";

const ayat: Ayah[] = [
  { number: 1, words: "بسم الله الرحمن الرحيم".split(" ").map((uthmani) => ({ uthmani })) },
  { number: 2, words: "الحمد لله رب العالمين".split(" ").map((uthmani) => ({ uthmani })) },
];

test("a clear recitation is reliable and scored", () => {
  const fb = analyzeRecitation(ayat, "بسم الله الرحمن الرحيم الحمد لله رب العالمين", [], "test");
  assert.equal(fb.reliable, true);
  assert.ok(fb.matchRate >= 0.9);
  assert.ok(fb.score >= 80);
});

test("garbage recognition is NOT scored (confidence gate)", () => {
  // Unrelated words — the recogniser clearly failed. Must not judge the reciter.
  const fb = analyzeRecitation(ayat, "كتاب قلم مدرسة سيارة طاوله نافذه", [], "test");
  assert.equal(fb.reliable, false);
});

test("too little heard is NOT scored", () => {
  const fb = analyzeRecitation(ayat, "بسم", [], "test");
  assert.equal(fb.reliable, false);
});

test("empty transcript is NOT scored", () => {
  const fb = analyzeRecitation(ayat, "", [], "test");
  assert.equal(fb.reliable, false);
});

test("a mostly-correct recitation with a couple of slips stays reliable", () => {
  // One wrong word out of eight — still clearly heard.
  const fb = analyzeRecitation(ayat, "بسم الله الرحمن الرحيم الحمد لله رب كتاب", [], "test");
  assert.equal(fb.reliable, true);
});
