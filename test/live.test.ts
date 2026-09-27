import { test } from "node:test";
import assert from "node:assert/strict";
import { trackLive, mergeLiveStatuses } from "../lib/live";
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

// ── Live mistake detection ───────────────────────────────────────────────────

const long = ["الحمد", "لله", "رب", "العالمين", "الرحمن", "الرحيم", "مالك", "يوم", "الدين"].map(normalizeWord);

test("mistake mode marks a jumped-over word as skipped", () => {
  const { statuses, pointer } = trackLive(long, ["الحمد", "رب"].map(normalizeWord), 0, { mistakes: true });
  assert.equal(statuses[0], "correct");
  assert.equal(statuses[1], "missing");
  assert.equal(statuses[2], "correct");
  assert.equal(pointer, 3);
});

test("mistake mode marks an unrecognised word between two matches as substituted", () => {
  const { statuses, extras } = trackLive(long, ["الحمد", "كتاب", "رب"].map(normalizeWord), 0, { mistakes: true });
  assert.equal(statuses[1], "wrong");
  assert.equal(statuses[2], "correct");
  assert.equal(extras, 0);
});

test("mistake mode counts an added word without painting the text", () => {
  const { statuses, extras } = trackLive(long, ["الحمد", "كتاب", "لله"].map(normalizeWord), 0, { mistakes: true });
  assert.equal(statuses[0], "correct");
  assert.equal(statuses[1], "correct");
  assert.equal(extras, 1);
  assert.equal(Object.values(statuses).filter((s) => s === "wrong" || s === "missing").length, 0);
});

test("mistake mode: two unrecognised words in a row flag the current slot", () => {
  const { statuses, pointer } = trackLive(long, ["الحمد", "كتاب", "قلم"].map(normalizeWord), 0, { mistakes: true });
  assert.equal(statuses[1], "wrong");
  assert.equal(pointer, 2);
});

test("mistake mode never marks a word twice or downgrades a match", () => {
  const { statuses } = trackLive(long, ["الحمد", "رب", "لله"].map(normalizeWord), 0, { mistakes: true });
  // Re-reading the skipped word restores it.
  assert.equal(statuses[1], "correct");
});

test("default mode stays positive-only even with the same input", () => {
  const { statuses, extras } = trackLive(long, ["الحمد", "كتاب", "رب"].map(normalizeWord));
  assert.equal(statuses[1], undefined);
  assert.equal(extras, 0);
});

test("mergeLiveStatuses: green sticks, red recovers, red never overwrites green", () => {
  const a = mergeLiveStatuses({}, { 0: "correct", 1: "missing" });
  assert.deepEqual(a, { 0: "correct", 1: "missing" });
  const b = mergeLiveStatuses(a, { 0: "wrong", 1: "correct" });
  assert.equal(b[0], "correct");
  assert.equal(b[1], "correct");
  const same = mergeLiveStatuses(b, { 0: "correct" });
  assert.equal(same, b); // unchanged → same object
});
