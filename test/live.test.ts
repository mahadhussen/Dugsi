import { test } from "node:test";
import assert from "node:assert/strict";
import { trackLive } from "../lib/live";
import { normalizeWord } from "../lib/arabic";

const expected = ["بسم", "الله", "الرحمن", "الرحيم"].map(normalizeWord);

test("live tracking lights up correct words and advances the pointer", () => {
  const { statuses, pointer } = trackLive(expected, ["بسم", "الله"].map(normalizeWord));
  assert.equal(statuses[0], "correct");
  assert.equal(statuses[1], "correct");
  assert.equal(pointer, 2); // next word to recite
  assert.equal(statuses[2], undefined); // not reached yet
});

test("live tracking marks a skipped word as missing", () => {
  // Reciter jumps from word 0 to word 2 (skips "الله").
  const { statuses, pointer } = trackLive(expected, ["بسم", "الرحمن"].map(normalizeWord));
  assert.equal(statuses[0], "correct");
  assert.equal(statuses[1], "missing");
  assert.equal(statuses[2], "correct");
  assert.equal(pointer, 3);
});

test("live tracking flags a wrong word without losing its place", () => {
  const { statuses, pointer } = trackLive(expected, ["بسم", normalizeWord("كتاب")]);
  assert.equal(statuses[0], "correct");
  assert.equal(statuses[1], "wrong");
  assert.equal(pointer, 1); // stays so the reciter can correct
});

test("live tracking recovers after repeated misses instead of stalling", () => {
  const { pointer } = trackLive(expected, ["بسم", "كتاب", "قلم"].map(normalizeWord));
  assert.ok(pointer >= 2, `expected the pointer to step forward, got ${pointer}`);
});

test("live tracking lets you re-read an earlier word without marking it wrong", () => {
  // read three words, then go back and re-read the second one
  const { statuses } = trackLive(
    expected,
    ["بسم", "الله", "الرحمن", "الله"].map(normalizeWord),
  );
  assert.equal(statuses[1], "correct"); // the re-read word stays correct, not wrong
});

test("live tracking accepts a near match as 'close' and advances", () => {
  // "الل" is "الله" missing its final letter — above the close threshold.
  const { statuses, pointer } = trackLive(expected, ["بسم", "الل"].map(normalizeWord));
  assert.ok(statuses[1] === "close" || statuses[1] === "correct");
  assert.equal(pointer, 2);
});
