import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeWord, tokenize } from "../lib/arabic";
import { alignRecitation } from "../lib/align";
import { fatiha, flattenWords } from "../lib/quran/fatiha";
import { analyzeRecitation } from "../lib/analyze";

const expected = flattenWords(fatiha).map((f) => f.word.uthmani);
const perfectTranscript = fatiha.ayat.map((a) => a.words.map((w) => w.uthmani).join(" ")).join(" ");

test("normalizeWord strips diacritics and unifies alef forms", () => {
  assert.equal(normalizeWord("ٱلرَّحْمَٰنِ"), normalizeWord("الرحمن"));
  assert.equal(normalizeWord("إِيَّاكَ"), normalizeWord("اياك"));
});

test("a perfect recitation scores 100% accuracy", () => {
  const result = alignRecitation(expected, tokenize(perfectTranscript));
  assert.equal(result.accuracy, 1);
  assert.equal(result.words.every((w) => w.status === "correct"), true);
  assert.equal(result.extras.length, 0);
});

test("a skipped word is detected as missing", () => {
  const heard = tokenize(perfectTranscript).filter((_, i) => i !== 5);
  const result = alignRecitation(expected, heard);
  const missing = result.words.filter((w) => w.status === "missing");
  assert.equal(missing.length, 1);
  assert.equal(missing[0].refIndex, 5);
});

test("a wrong word is flagged and accuracy drops", () => {
  const tokens = tokenize(perfectTranscript);
  tokens[2] = normalizeWord("كتاب"); // replace a word with something unrelated
  const result = alignRecitation(expected, tokens);
  assert.ok(result.accuracy < 1);
  assert.equal(result.words[2].status !== "correct", true);
});

test("analyzeRecitation produces a high score for a perfect transcript", () => {
  const feedback = analyzeRecitation(fatiha.ayat, perfectTranscript, [], "test");
  assert.ok(feedback.score >= 95, `expected >=95, got ${feedback.score}`);
  assert.match(feedback.summary, /correctly/);
});
