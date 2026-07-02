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

import { liveClipTimes, mergeClipTimes, clipForMistake } from "../lib/review";

test("liveClipTimes builds windows leaning back from the stamp", () => {
  const clips = liveClipTimes({ 5: 10 });
  assert.deepEqual(clips[5], { start: 6, end: 10.8 });
  // Early words clamp at 0.
  assert.deepEqual(liveClipTimes({ 0: 1 })[0], { start: 0, end: 1.8 });
});

test("mergeClipTimes lets precise Whisper times win over live windows", () => {
  const merged = mergeClipTimes({ 3: { start: 4, end: 4.6 } }, { 3: { start: 1, end: 6 }, 4: { start: 5, end: 9 } });
  assert.deepEqual(merged[3], { start: 4, end: 4.6 }); // precise wins
  assert.deepEqual(merged[4], { start: 5, end: 9 }); // live fills the gap
});

test("clipForMistake: skipped words play the nearby passage, mis-said words never borrow", () => {
  const times = { 10: { start: 20, end: 24 } };
  assert.deepEqual(clipForMistake(times, 10, false), times[10]); // exact, mis-said
  assert.deepEqual(clipForMistake(times, 12, true), times[10]); // skipped → nearby passage
  assert.equal(clipForMistake(times, 12, false), undefined); // mis-said w/o own clip → honest "no clip"
  assert.equal(clipForMistake(times, 30, true), undefined); // too far even for skipped
});
