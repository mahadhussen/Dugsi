import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRefTimes } from "../lib/review";
import { normalizeWord } from "../lib/arabic";

const t = (word: string, start: number, end: number) => ({ word, start, end });

test("maps each spoken reference word to its timed range, in order", () => {
  const words = [
    { refIndex: 0, heard: normalizeWord("بسم") },
    { refIndex: 1, heard: normalizeWord("الله") },
    { refIndex: 2, heard: normalizeWord("الرحمن") },
  ];
  const timed = [t("بسم", 0, 0.5), t("الله", 0.5, 1.0), t("الرحمن", 1.0, 1.8)];
  const map = mapRefTimes(words, timed);
  assert.deepEqual(map[0], { start: 0, end: 0.5 });
  assert.deepEqual(map[1], { start: 0.5, end: 1.0 });
  assert.deepEqual(map[2], { start: 1.0, end: 1.8 });
});

test("skipped words get no time range", () => {
  const words = [
    { refIndex: 0, heard: normalizeWord("بسم") },
    { refIndex: 1, heard: null }, // skipped
    { refIndex: 2, heard: normalizeWord("الرحمن") },
  ];
  const timed = [t("بسم", 0, 0.5), t("الرحمن", 0.6, 1.2)];
  const map = mapRefTimes(words, timed);
  assert.ok(map[0]);
  assert.equal(map[1], undefined);
  assert.deepEqual(map[2], { start: 0.6, end: 1.2 });
});

test("tolerates an extra timed word via look-ahead", () => {
  const words = [
    { refIndex: 0, heard: normalizeWord("بسم") },
    { refIndex: 1, heard: normalizeWord("الرحيم") },
  ];
  // The reciter mumbled an extra token between the two real words.
  const timed = [t("بسم", 0, 0.5), t("اه", 0.5, 0.6), t("الرحيم", 0.6, 1.3)];
  const map = mapRefTimes(words, timed);
  assert.deepEqual(map[0], { start: 0, end: 0.5 });
  assert.deepEqual(map[1], { start: 0.6, end: 1.3 });
});

test("no timestamps yields an empty map", () => {
  const map = mapRefTimes([{ refIndex: 0, heard: "بسم" }], []);
  assert.deepEqual(map, {});
});
