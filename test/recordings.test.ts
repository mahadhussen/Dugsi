import { test } from "node:test";
import assert from "node:assert/strict";
import { selectEvictions, withinBlobLimit, type RecordingMeta } from "../lib/recordings";

const MB = 1024 * 1024;

// Helper: a recording of `mb` megabytes, `daysAgo` old (larger daysAgo = older).
function rec(surah: number, mb: number, daysAgo: number): RecordingMeta {
  return { surah, size: mb * MB, createdAt: -daysAgo };
}

test("nothing is evicted when under both caps", () => {
  const recs = [rec(1, 1, 0), rec(2, 1, 1), rec(3, 1, 2)];
  assert.deepEqual(selectEvictions(recs, 12, 80 * MB), []);
});

test("count cap evicts the oldest beyond the limit", () => {
  // 4 recordings, cap of 2 → the two oldest (surah 3 and 4) are dropped.
  const recs = [rec(1, 1, 0), rec(2, 1, 1), rec(3, 1, 2), rec(4, 1, 3)];
  const drop = selectEvictions(recs, 2, 80 * MB);
  assert.deepEqual(drop.sort((a, b) => a - b), [3, 4]);
});

test("byte budget evicts the oldest until the store fits", () => {
  // Three 30 MB recordings, 80 MB budget → only the two newest fit (60 MB);
  // the oldest (surah 3) is evicted even though the count cap allows it.
  const recs = [rec(1, 30, 0), rec(2, 30, 1), rec(3, 30, 2)];
  const drop = selectEvictions(recs, 12, 80 * MB);
  assert.deepEqual(drop, [3]);
});

test("the newest recording is always kept, older ones give way", () => {
  // Newest is large; older small ones are dropped to make room within budget.
  const recs = [rec(1, 70, 0), rec(2, 20, 1), rec(3, 20, 2)];
  const drop = selectEvictions(recs, 12, 80 * MB).sort((a, b) => a - b);
  assert.deepEqual(drop, [2, 3]); // only the 70 MB newest survives
});

test("eviction is order-independent (unsorted input)", () => {
  const recs = [rec(3, 1, 2), rec(1, 1, 0), rec(4, 1, 3), rec(2, 1, 1)];
  const drop = selectEvictions(recs, 2, 80 * MB);
  assert.deepEqual(drop.sort((a, b) => a - b), [3, 4]);
});

test("withinBlobLimit rejects empty and oversized blobs", () => {
  assert.equal(withinBlobLimit(0), false);
  assert.equal(withinBlobLimit(1 * MB), true);
  assert.equal(withinBlobLimit(24 * MB), true);
  assert.equal(withinBlobLimit(26 * MB), false); // above the ~25 MB per-blob cap
});
