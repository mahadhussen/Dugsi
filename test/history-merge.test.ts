import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeHistory, type LocalSession } from "../lib/history";

const at = (h: number) => new Date(Date.UTC(2026, 5, 1, h)).toISOString();

test("merge keeps one row per client id and marks it synced", () => {
  const local: LocalSession[] = [{ surah: 1, score: 80, created_at: at(1), client_id: "a", synced: false }];
  const merged = mergeHistory(local, [{ surah: 1, score: 80, created_at: at(1), client_id: "a", seconds: 42 }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].synced, true);
  assert.equal(merged[0].seconds, 42); // richer cloud detail filled in
});

test("merge dedupes pre-client-id rows on surah, score and timestamp", () => {
  const local: LocalSession[] = [{ surah: 2, score: 70, created_at: at(2), client_id: "b" }];
  const merged = mergeHistory(local, [{ surah: 2, score: 70, created_at: at(2), client_id: null }]);
  assert.equal(merged.length, 1);
});

test("merge adds rows from other devices, newest first", () => {
  const local: LocalSession[] = [{ surah: 1, score: 80, created_at: at(1), client_id: "a" }];
  const merged = mergeHistory(local, [{ surah: 3, score: 60, created_at: at(5), client_id: "c" }]);
  assert.deepEqual(merged.map((r) => r.client_id), ["c", "a"]);
  assert.equal(merged[0].synced, true);
});
