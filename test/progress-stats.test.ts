import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStats, MEMORISED_THRESHOLD, type SessionRow } from "../lib/supabase/progress";

const NOW = new Date("2026-06-28T20:00:00");

// A session `daysAgo` before NOW, newest-first ordering is the caller's job.
function row(surah: number, score: number, daysAgo: number): SessionRow {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  return { surah, score, created_at: d.toISOString() };
}

// rows must be newest-first, like the DB query returns.
function sorted(rows: SessionRow[]): SessionRow[] {
  return [...rows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

test("counts a consecutive day streak including today", () => {
  const s = computeStats(sorted([row(1, 80, 0), row(1, 70, 1), row(2, 90, 2)]), NOW);
  assert.equal(s.streak, 3);
});

test("streak survives if today has no session yet (starts yesterday)", () => {
  const s = computeStats(sorted([row(1, 80, 1), row(1, 70, 2)]), NOW);
  assert.equal(s.streak, 2);
});

test("streak stops at a gap", () => {
  const s = computeStats(sorted([row(1, 80, 0), row(1, 70, 1), row(1, 60, 5)]), NOW);
  assert.equal(s.streak, 2);
});

test("aggregates per surah: attempts and best score", () => {
  const s = computeStats(sorted([row(2, 60, 0), row(2, 95, 1), row(2, 70, 3)]), NOW);
  assert.equal(s.bySurah.length, 1);
  assert.equal(s.bySurah[0].surah, 2);
  assert.equal(s.bySurah[0].attempts, 3);
  assert.equal(s.bySurah[0].bestScore, 95);
});

test("per-surah list is ordered by most recently practised", () => {
  const s = computeStats(sorted([row(5, 50, 0), row(3, 50, 2), row(9, 50, 4)]), NOW);
  assert.deepEqual(s.bySurah.map((x) => x.surah), [5, 3, 9]);
});

test("memorisedCount counts surahs whose best score reaches the threshold", () => {
  const s = computeStats(
    sorted([row(1, MEMORISED_THRESHOLD, 0), row(2, 88, 1), row(3, 99, 2)]),
    NOW,
  );
  assert.equal(s.memorisedCount, 2); // surah 1 (==90) and 3 (99); surah 2 (88) not yet
});

test("todayCount counts only sessions from today", () => {
  const s = computeStats(sorted([row(1, 80, 0), row(2, 70, 0), row(3, 60, 1)]), NOW);
  assert.equal(s.todayCount, 2);
});

test("empty history yields zeroed stats", () => {
  const s = computeStats([], NOW);
  assert.equal(s.totalSessions, 0);
  assert.equal(s.streak, 0);
  assert.equal(s.memorisedCount, 0);
  assert.deepEqual(s.bySurah, []);
});
