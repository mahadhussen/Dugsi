// The vowel model's findings, from a piece to the marks: which text words a
// piece is judged on, and that only the vowel model decides vowels once it
// judges an attempt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSurah } from "../lib/quran";
import { flattenAyat } from "../lib/quran/types";
import { loadCtcText } from "../lib/quran/ctc-text";
import { buildRef } from "../lib/follow/text";
import { applyPiece, bestMarks, createFollower, type FollowState, type PieceInput } from "../lib/follow/follower";
import { verdictOf } from "../lib/follow/verdict";
import { pieceVowelWords } from "../lib/listen/vowel-pass";
import { VOWEL_MODEL } from "../lib/listen/vowel-model";

// Mark order differs (the model's text has shadda first); compare as NFC.
const nfc = (ws: string[]) => ws.map((w) => w.normalize("NFC"));

async function surah(id: number) {
  const s = await loadSurah(id);
  const ctc = await loadCtcText(id);
  return { ayat: s.ayat, vowelWords: s.ayat.flatMap((a) => ctc[a.number - 1]) };
}

const modelPiece = (id: number, words: string[], t0 = id * 5): PieceInput => ({
  id,
  t0,
  t1: t0 + 4,
  text: words.join(" "),
  words: words.map((text, i) => ({ text, start: t0 + i * 0.8, end: t0 + i * 0.8 + 0.7 })),
  source: "model",
});

test("a piece is judged on the text words it was placed on, in the model's spelling", async () => {
  const { ayat, vowelWords } = await surah(1);
  let s = createFollower(buildRef(ayat));
  s = applyPiece(s, modelPiece(1, ["الْحَمْدُ", "لِلَّهِ", "رَبِّ", "الْعَالَمِينَ"]));
  const p = s.pieces.at(-1)!;
  const w = pieceVowelWords(p, vowelWords, s.ref.ayah)!;
  assert.deepEqual(nfc(w.words), nfc(["الْحَمْدُ", "لِلَّهِ", "رَبِّ", "الْعَالَمِينَ"]));
  assert.deepEqual(w.owner, [4, 5, 6, 7]); // after the basmala's four words
  assert.deepEqual([...w.verseEnds], [3], "the verse's last word: its ending is never judged");
});

test("an Uthmani word the model writes as two is one text word", async () => {
  const { ayat, vowelWords } = await surah(20);
  const v11 = ayat.find((a) => a.number === 11)!; // فَلَمَّآ أَتَىٰهَا نُودِيَ يَٰمُوسَىٰٓ
  let s = createFollower(buildRef([v11]));
  s = applyPiece(s, modelPiece(1, ["فَلَمَّا", "أَتَاهَا", "نُودِيَ", "يَا", "مُوسَى"]));
  const w = pieceVowelWords(s.pieces.at(-1)!, vowelWords.slice(buildRef(ayat).verseFirst.get(11)!), s.ref.ayah)!;
  assert.deepEqual(nfc(w.words.slice(-2)), nfc(["يَا", "مُوسَى\u0670"]));
  assert.deepEqual(w.owner.slice(-2), [3, 3]);
  assert.deepEqual([...w.verseEnds], [w.words.length - 1], "only the last model word ends the verse");
});

test("once the vowel model judges, only it decides vowels", async () => {
  const { ayat } = await surah(1);
  const words = flattenAyat(ayat).map((f) => f.word);
  // The listening model wrote al-ḥamda (a wrong ending, not at a pause).
  let s = createFollower(buildRef(ayat));
  s = applyPiece(s, modelPiece(1, ["الْحَمْدَ", "لِلَّهِ", "رَبِّ", "الْعَالَمِينَ"]));
  const id = s.pieces.at(-1)!.input.id;
  assert.equal(bestMarks(s).get(4)!.vowel?.heard, "a", "the listening model's vowel, with no vowel model");

  const judged: FollowState = { ...s, vowels: { pieces: new Map([[id, new Map()]]) } };
  assert.equal(bestMarks(judged).get(4)!.status, "correct", "the vowel model heard it right");

  const wrong: FollowState = {
    ...s,
    vowels: { pieces: new Map([[id, new Map([[5, { slip: { at: 0, want: "i", heard: "u", ending: false }, said: "لُلَّهِ" }]])]]) },
  };
  const m = bestMarks(wrong);
  assert.equal(m.get(4)!.status, "correct");
  assert.equal(m.get(5)!.status, "wrong");
  assert.equal(m.get(5)!.heard, "لُلَّهِ");
  const v = verdictOf(wrong, { words, engine: "test" });
  const mistake = v.mistakes.find((x) => x.refIndex === 5)!;
  assert.equal(mistake.kind, "wrong");
  assert.deepEqual(mistake.vowel, { at: 0, want: "i", heard: "u" });
});

test("a later piece that says the word right corrects a wrong vowel", async () => {
  const { ayat } = await surah(1);
  let s = createFollower(buildRef(ayat));
  s = applyPiece(s, modelPiece(1, ["الْحَمْدُ", "لِلَّهِ"]));
  s = applyPiece(s, modelPiece(2, ["الْحَمْدُ", "لِلَّهِ", "رَبِّ", "الْعَالَمِينَ"]));
  const [a, b] = s.pieces.map((p) => p.input.id);
  const slip = { slip: { at: 0, want: "i" as const, heard: "u" as const, ending: false }, said: "لُلَّهِ" };
  const state: FollowState = { ...s, vowels: { pieces: new Map([[a, new Map([[5, slip]])], [b, new Map()]]) } };
  const m = bestMarks(state).get(5)!;
  assert.equal(m.status, "correct");
  assert.equal(m.corrected, true);
});

test("the vowel model's letters are the ones the judge was measured with", async () => {
  const { readFileSync } = await import("node:fs");
  const facit = JSON.parse(readFileSync(new URL("./fixtures/ctc/facit.json", import.meta.url), "utf8"));
  assert.deepEqual(VOWEL_MODEL.vocab, facit.vocab);
  assert.equal(VOWEL_MODEL.blank, facit.blank);
  assert.equal(VOWEL_MODEL.delimiter, facit.delimiter);
});
