import { test } from "node:test";
import assert from "node:assert/strict";
import { weakSpots, describe, FIXED_AFTER } from "../lib/memory/weak-spots";
import type { SessionRow } from "../lib/history";

// Surah 112 as word → verse: 4 + 2 + 4 + 5 words.
const verses = new Map([[112, [1, 1, 1, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4]]]);
const row = (day: number, mistakes: SessionRow["mistakes"], from = 1, to = 4): SessionRow => ({
  surah: 112,
  score: 90,
  created_at: new Date(Date.UTC(2026, 9, day, 12)).toISOString(),
  mistakes,
  from_verse: from,
  to_verse: to,
});
const now = new Date(Date.UTC(2026, 9, 30, 12));

test("a word skipped twice and said wrong once is understood as both", () => {
  const [s] = weakSpots(
    [row(1, [{ i: 5, h: null, t: "s" }]), row(2, [{ i: 5, h: "صمد", t: "w" }]), row(3, [{ i: 5, h: null, t: "s" }])],
    verses,
    now,
  );
  assert.equal(s.skipped, 2);
  assert.equal(s.wrong, 1);
  assert.equal(s.pattern, "both");
  assert.equal(s.verse, 2);
  assert.match(describe(s), /skipped 2×/);
  assert.match(describe(s), /صمد/);
});

test("clean recitations of the verse afterwards put the word right", () => {
  const rows = [row(1, [{ i: 5, h: null, t: "s" }])];
  for (let d = 0; d < FIXED_AFTER; d++) rows.push(row(2 + d, []));
  const [s] = weakSpots(rows, verses, now);
  assert.equal(s.cleanSince, FIXED_AFTER);
  assert.equal(s.state, "fixed");
  assert.equal(s.due, false);
});

test("a recitation of another verse is not counted as practising this word", () => {
  const [s] = weakSpots([row(1, [{ i: 5, h: null, t: "s" }]), row(2, [], 3, 4)], verses, now);
  assert.equal(s.cleanSince, 0);
  assert.equal(s.state, "slipping");
});

test("a word right once is due again after a day, not before", () => {
  const rows = [row(1, [{ i: 0, h: "قال", t: "w" }]), row(29, [])];
  assert.equal(weakSpots(rows, verses, new Date(Date.UTC(2026, 9, 29, 18)))[0].due, false);
  assert.equal(weakSpots(rows, verses, new Date(Date.UTC(2026, 9, 30, 13)))[0].due, true);
});

test("old rows without a kind still read: no heard word means skipped", () => {
  const [s] = weakSpots([row(1, [{ i: 2, h: null }])], verses, now);
  assert.equal(s.skipped, 1);
});

test("what still slips comes before what is fixed", () => {
  const rows = [row(1, [{ i: 0, h: null, t: "s" }, { i: 10, h: "احد", t: "w" }])];
  for (let d = 0; d < FIXED_AFTER; d++) rows.push(row(2 + d, [{ i: 10, h: "احد", t: "w" }]));
  const out = weakSpots(rows, verses, now);
  assert.equal(out[0].i, 10, "the word still said wrong comes first");
  assert.equal(out.at(-1)!.state, "fixed");
});
