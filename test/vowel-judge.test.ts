// The CTC vowel judge against its facit: PyTorch's ctc_loss and the Python
// measurement (scratch eval.py) on the same model output. The fixtures hold
// the per-frame log-probabilities the Quran CTC model (rabah2026
// wav2vec2-large-xlsr-53-arabic-quran-v_final) gave for macOS Majed reading
// verses with one deliberate vowel mistake.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ctcAlign, ctcNll, greedy, type LogProbs } from "../lib/follow/ctc";
import {
  encodeWords,
  heardPairs,
  likeness,
  heardWords,
  judgeVowels,
  vowelFindings,
  vowelMargins,
  vowelSlots,
  type CtcVocab,
} from "../lib/follow/vowel-judge";

const DIR = new URL("./fixtures/ctc/", import.meta.url);
const facit = JSON.parse(readFileSync(new URL("facit.json", DIR), "utf8"));
const vocab: CtcVocab = { ids: facit.vocab, blank: facit.blank, delimiter: facit.delimiter };

function lpOf(name: string, frames: number, size: number): LogProbs {
  const b = readFileSync(new URL(`${name}.lp.f32`, DIR));
  const data = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.equal(data.length, frames * size);
  return { frames, vocab: size, data };
}
const near = (a: number, b: number, tol: number, what: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("ctcNll is PyTorch's ctc_loss", () => {
  const r = facit.random;
  const lp = lpOf("random", r.frames, r.vocab);
  for (const c of r.cases) {
    // 25 repeats need 49 frames, there are 40: PyTorch (zero_infinity) says 0.
    if (c.nll === 0) assert.equal(ctcNll(lp, c.ids, r.blank), Infinity);
    else near(ctcNll(lp, c.ids, r.blank), c.nll, 1e-3 * Math.max(1, c.nll), `ids ${c.ids}`);
  }
});

test("a text longer than the frames allow cannot fit", () => {
  const lp: LogProbs = { frames: 2, vocab: 3, data: new Float32Array(6).fill(Math.log(1 / 3)) };
  assert.equal(ctcNll(lp, [1, 2, 1], 0), Infinity);
  assert.equal(ctcAlign(lp, [1, 2, 1], 0), null);
  assert.ok(Number.isFinite(ctcNll(lp, [1, 2], 0)));
});

test("the best path puts every letter on frames in order", () => {
  for (const c of facit.clips) {
    const lp = lpOf(c.name, c.frames, Object.keys(facit.vocab).length);
    const path = ctcAlign(lp, c.ids, vocab.blank)!;
    assert.ok(path, c.name);
    for (let k = 0; k < c.ids.length; k++) {
      assert.ok(path.first[k] >= 0 && path.first[k] <= path.last[k], `${c.name} letter ${k}`);
      if (k) assert.ok(path.first[k] > path.last[k - 1] || c.ids[k] !== c.ids[k - 1], `${c.name} order ${k}`);
    }
    assert.ok(greedy(lp, vocab.blank).length > 0);
  }
});

test("the words are spelled with the model's letters, shadda before the vowel", () => {
  for (const c of facit.clips) assert.deepEqual(encodeWords(c.words, vocab).ids, c.ids, c.name);
  const sh = encodeWords(["رَبِّ"], vocab).ids; // written vowel-then-shadda here
  assert.deepEqual(sh, ["ر", "َ", "ب", "ّ", "ِ"].map((ch) => vocab.ids[ch]));
});

test("margins are the Python measurement's", () => {
  for (const c of facit.clips) {
    const lp = lpOf(c.name, c.frames, Object.keys(facit.vocab).length);
    near(ctcNll(lp, c.ids, vocab.blank), c.nll, 0.02, `${c.name} nll`);
    const got = vowelMargins(lp, c.words, vocab);
    const key = (m: { word: number; base: number; alt: string }) => `${m.word}:${m.base}:${m.alt}`;
    assert.deepEqual(got.map(key).sort(), c.rows.map(key).sort(), `${c.name} slots`);
    const want = new Map<string, number>(c.rows.map((r: any) => [key(r), r.margin]));
    for (const m of got) near(m.margin, want.get(key(m))!, 0.05, `${c.name} ${key(m)}`);
  }
});

test("each deliberate mistake is found on its word, with the vowel said, and nothing else", () => {
  for (const c of facit.clips) {
    const lp = lpOf(c.name, c.frames, Object.keys(facit.vocab).length);
    const found = vowelFindings(vowelMargins(lp, c.words, vocab));
    assert.deepEqual(found.map((f) => [f.word, f.heard]), [[c.word, c.said]], c.name);
  }
});

test("what is never judged: a paused ending, a vowel before a long vowel, a dagger alif", () => {
  const at = (w: string, paused = false) => vowelSlots(w, paused).map((s) => `${s.base}${s.vowel}`);
  assert.deepEqual(at("الْحَمْدُ"), ["2a", "4u"]); // ا ل ح م د: ḥa, du
  assert.deepEqual(at("الْحَمْدُ", true), ["2a"]); // waqf: the ending is silent
  assert.deepEqual(at("مَالِكِ"), ["2i", "3i"]); // mā: the m's vowel is the long ā
  assert.deepEqual(at("الرَّحْمَـٰنِ"), ["2a", "5i"]); // mā (dagger alif) not judged
  assert.deepEqual(at("الْعَالَمِينَ"), ["4a", "7a"]); // ʿā and mī are long
});

test("heard words are paired with text words by likeness, as in the Python measurement", () => {
  for (const c of facit.clips) {
    const lp = lpOf(c.name, c.frames, Object.keys(facit.vocab).length);
    const heard = heardWords(lp, vocab);
    assert.deepEqual(heard, c.heard, `${c.name} heard`);
    assert.deepEqual([...heardPairs(heard, c.words)].sort((a, b) => a[0] - b[0]), c.pairs, c.name);
  }
  // A wrong vowel can change the spelling the model writes: still the same word.
  assert.deepEqual([...heardPairs(["مَاكِثِينَ", "فِيهَا", "أَبَدًا"], ["مَاكِثِينَ", "فِيهِ", "أَبَدًا"])], [
    [2, 2],
    [1, 1],
    [0, 0],
  ]);
  // A word not said is paired with nothing.
  assert.deepEqual([...heardPairs(["الْحَمْدُ", "لِلَّهِ"], ["بِسْمِ", "اللَّهِ", "الْحَمْدُ", "لِلَّهِ"]).values()].sort(), [2, 3]);
  assert.equal(likeness("فيها", "فيه"), 6 / 7);
  // Two text words run together are not one of them: paired, اهْدِنَا's sound
  // made نَسْتَعِينُ's ending look wrong (10.9 on Alafasy's right reading).
  const run = heardPairs(["وَإِيَّاكَ", "نَسْتَعِياهْدِنَا", "الصِّرَاطَ"], ["وَإِيَّاكَ", "نَسْتَعِينُ", "اهْدِنَا", "الصِّرَاطَ"]);
  assert.deepEqual([...run].sort((a, b) => a[0] - b[0]), [
    [0, 0],
    [2, 3],
  ]);
});

test("in the heard context, the findings and margins are the Python measurement's", () => {
  for (const c of facit.clips) {
    const lp = lpOf(c.name, c.frames, Object.keys(facit.vocab).length);
    const want = vowelFindings(c.ctxRows);
    const got = judgeVowels(lp, c.words, vocab);
    assert.deepEqual(got.map((f) => [f.word, f.base, f.heard]), want.map((f) => [f.word, f.base, f.heard]), c.name);
    got.forEach((f, k) => near(f.margin, want[k].margin, 0.05, `${c.name} word ${f.word}`));
  }
});
