import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTimings, verseAt, verseEnd, verseStart, type VerseSpan } from "../lib/listen/surah-timing";
// Real answers from mp3quran.net /api/v3/ayat_timing, captured 2026-10-25.
import alafasy112 from "./fixtures/timing/alafasy-112.json";
import hudhaify112 from "./fixtures/timing/hudhaify-112.json";
import alafasy1 from "./fixtures/timing/alafasy-1.json";

const row = (ayah: number, start: number, end: number) => ({ ayah, start_time: start, end_time: end });

test("a real recording's timings become verse spans in seconds (Alafasy, Al-Ikhlas)", () => {
  assert.deepEqual(parseTimings(alafasy112, 4, 112), [
    { verse: 1, start: 7.539, end: 10.374 },
    { verse: 2, start: 10.374, end: 13.167 },
    { verse: 3, start: 13.167, end: 16.548 },
    { verse: 4, start: 16.548, end: 20.706 },
  ]);
});

test("Hudhaify's Al-Ikhlas is numbered 0..3 for four verses: rejected, so it plays verse by verse", () => {
  assert.equal(parseTimings(hudhaify112, 4, 112), null);
});

test("Al-Fatiha numbered 1..7 is kept as it is (Alafasy)", () => {
  const v = parseTimings(alafasy1, 7, 1)!;
  assert.equal(v.length, 7);
  assert.deepEqual(v[0], { verse: 1, start: 6.42, end: 11.12 });
  assert.deepEqual(v[6], { verse: 7, start: 38.96, end: 51.2 });
});

test("Al-Fatiha numbered 0..6 (basmala as 0) is shifted to 1..7", () => {
  const raw = [0, 1, 2, 3, 4, 5, 6].map((a) => row(a, 1000 + a * 1000, 1900 + a * 1000));
  const v = parseTimings(raw, 7, 1)!;
  assert.deepEqual(v.map((s) => s.verse), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(v[0], { verse: 1, start: 1, end: 1.9 });
});

test("Al-Fatiha with an opening 0 and verses 1..7 keeps 1..7 and drops the opening", () => {
  const raw = [0, 1, 2, 3, 4, 5, 6, 7].map((a) => row(a, a * 1000, a * 1000 + 900));
  const v = parseTimings(raw, 7, 1)!;
  assert.deepEqual(v.map((s) => s.verse), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(v[0].start, 1);
});

test("0..n-1 is shifted only in Al-Fatiha: elsewhere ayah 0 is the opening", () => {
  const raw = [0, 1, 2, 3].map((a) => row(a, a * 1000, a * 1000 + 900));
  assert.equal(parseTimings(raw, 4, 112), null);
});

test("rows out of order are sorted by verse first", () => {
  const raw = [row(3, 3000, 3900), row(1, 1000, 1900), row(2, 2000, 2900)];
  assert.deepEqual(parseTimings(raw, 3, 103)!.map((s) => s.verse), [1, 2, 3]);
});

test("timings that cannot be trusted give no timing at all", () => {
  const ok = [row(1, 1000, 1900), row(2, 2000, 2900), row(3, 3000, 3900)];
  assert.ok(parseTimings(ok, 3, 103));
  // start times going back
  assert.equal(parseTimings([row(1, 1000, 1900), row(2, 500, 2900), row(3, 3000, 3900)], 3, 103), null);
  // a verse of zero or negative length
  assert.equal(parseTimings([row(1, 1000, 1000), row(2, 2000, 2900), row(3, 3000, 3900)], 3, 103), null);
  assert.equal(parseTimings([row(1, 1000, 900), row(2, 2000, 2900), row(3, 3000, 3900)], 3, 103), null);
  // a verse missing, a verse twice, one too many
  assert.equal(parseTimings([row(1, 1000, 1900), row(3, 3000, 3900)], 3, 103), null);
  assert.equal(parseTimings([row(1, 1000, 1900), row(2, 2000, 2900), row(2, 2000, 2900)], 3, 103), null);
  assert.equal(parseTimings([...ok, row(4, 4000, 4900)], 3, 103), null);
  // times that are not numbers
  assert.equal(parseTimings([row(1, 1000, 1900), { ayah: 2, start_time: "x", end_time: 2900 }, row(3, 3000, 3900)], 3, 103), null);
  // not a list
  assert.equal(parseTimings(null, 3, 103), null);
  assert.equal(parseTimings({ ayah: 1 }, 3, 103), null);
});

const spans: VerseSpan[] = [
  { verse: 1, start: 7.5, end: 10.4 },
  { verse: 2, start: 10.4, end: 13.2 },
  { verse: 3, start: 13.2, end: 16.5 },
];

test("verseAt: the verse sounding at a time", () => {
  assert.equal(verseAt(spans, 0), 1); // the opening before verse 1 counts as verse 1
  assert.equal(verseAt(spans, 7.5), 1);
  assert.equal(verseAt(spans, 10.39), 2); // within 50 ms of the next start: already the next verse
  assert.equal(verseAt(spans, 10.3), 1);
  assert.equal(verseAt(spans, 12), 2);
  assert.equal(verseAt(spans, 13.2), 3);
  assert.equal(verseAt(spans, 99), 3); // past the end: the last verse
  assert.equal(verseAt([], 5), 1);
});

test("verseStart: verse 1 starts at the top so the opening is heard; others at their own start", () => {
  assert.equal(verseStart(spans, 1), 0);
  assert.equal(verseStart(spans, 2), 10.4);
  assert.equal(verseStart(spans, 3), 13.2);
  assert.equal(verseStart(spans, 9), 0); // unknown verse: from the top, never a wrong place
  assert.equal(verseEnd(spans, 3), 16.5);
  assert.equal(verseEnd(spans, 9), Infinity);
});
