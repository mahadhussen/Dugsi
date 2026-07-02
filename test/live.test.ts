import { test } from "node:test";
import assert from "node:assert/strict";
import { trackLive } from "../lib/live";
import { normalizeWord } from "../lib/arabic";

const expected = ["بسم", "الله", "الرحمن", "الرحيم"].map(normalizeWord);

test("live tracking lights up correct words and advances the pointer", () => {
  const { statuses, pointer } = trackLive(expected, ["بسم", "الله"].map(normalizeWord));
  assert.equal(statuses[0], "correct");
  assert.equal(statuses[1], "correct");
  assert.equal(pointer, 2);
  assert.equal(statuses[2], undefined); // not reached yet
});

test("skipping a word still matches the later word (no false marks)", () => {
  const { statuses, pointer } = trackLive(expected, ["بسم", "الرحمن"].map(normalizeWord));
  assert.equal(statuses[0], "correct");
  assert.equal(statuses[1], undefined); // skipped word is left neutral live
  assert.equal(statuses[2], "correct");
  assert.equal(pointer, 3);
});

test("an unrecognised word is not marked wrong live (positive only)", () => {
  const { statuses, pointer } = trackLive(expected, ["بسم", normalizeWord("كتاب")]);
  assert.equal(statuses[0], "correct");
  assert.equal(statuses[1], undefined); // no red while live
  assert.equal(pointer, 1); // holds so the reciter can continue
});

test("live tracking recovers after repeated misses instead of stalling", () => {
  const { pointer } = trackLive(expected, ["بسم", "كتاب", "قلم"].map(normalizeWord));
  assert.ok(pointer >= 2, `expected the pointer to step forward, got ${pointer}`);
});

test("live tracking lets you re-read an earlier word", () => {
  const { statuses } = trackLive(expected, ["بسم", "الله", "الرحمن", "الله"].map(normalizeWord));
  assert.equal(statuses[1], "correct");
});

test("live tracking accepts a near match as 'close' and advances", () => {
  const { statuses, pointer } = trackLive(expected, ["بسم", "الل"].map(normalizeWord));
  assert.ok(statuses[1] === "close" || statuses[1] === "correct");
  assert.equal(pointer, 2);
});

test("continuity bias keeps the cursor near position (no jump to a far repeat)", () => {
  // A common word that also appears far ahead should match the near one.
  const exp = ["الله", "رب", "العالمين", "الرحمن", "الرحيم", "الله"].map(normalizeWord);
  const { pointer } = trackLive(exp, ["الله", "رب"].map(normalizeWord));
  assert.equal(pointer, 2); // matched the first الله, not the one at index 5
});

test("startPointer resumes tracking mid-surah (incremental updates)", () => {
  // Simulate processing only newly heard tokens, continuing from pointer 2.
  const { statuses, pointer } = trackLive(expected, ["الرحمن", "الرحيم"].map(normalizeWord), 2);
  assert.equal(statuses[2], "correct");
  assert.equal(statuses[3], "correct");
  assert.equal(pointer, 4);
});
