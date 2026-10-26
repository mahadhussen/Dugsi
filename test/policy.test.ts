import { test } from "node:test";
import assert from "node:assert/strict";
import { isJoinCandidate, MAX_DECODE_SECONDS, preferJoined } from "../lib/listen/policy";

test("a short tail piece right after the one before is decoded again together", () => {
  // A madd that faded and came back: 0.3 s gap, a 1.2 s piece, one word.
  assert.equal(isJoinCandidate({ t0: 0, t1: 6 }, { t0: 6.3, t1: 7.5 }, 1), true);
  assert.equal(isJoinCandidate({ t0: 0, t1: 6 }, { t0: 6.3, t1: 7.5 }, 2), true);
});

test("pieces that stand on their own are not joined", () => {
  const prev = { t0: 0, t1: 6 };
  assert.equal(isJoinCandidate(null, { t0: 0, t1: 1 }, 1), false); // nothing before
  assert.equal(isJoinCandidate(prev, { t0: 6.8, t1: 7.5 }, 1), false); // a real pause (0.8 s)
  assert.equal(isJoinCandidate(prev, { t0: 6.3, t1: 11.3 }, 1), false); // a long piece (5 s)
  assert.equal(isJoinCandidate(prev, { t0: 6.3, t1: 7.5 }, 3), false); // three words: a phrase, not a tail
});

test("a join never sends more than the model can hold", () => {
  const prev = { t0: 0, t1: MAX_DECODE_SECONDS - 1.5 };
  assert.equal(isJoinCandidate(prev, { t0: prev.t1 + 0.2, t1: MAX_DECODE_SECONDS }, 1), true);
  assert.equal(isJoinCandidate(prev, { t0: prev.t1 + 0.2, t1: MAX_DECODE_SECONDS + 0.01 }, 1), false);
});

test("the joined decode is used only when it fits the text clearly better", () => {
  assert.equal(preferJoined(2, 2.6), true);
  assert.equal(preferJoined(2, 2.5), false); // a tie or a hair better: keep the pieces apart
  assert.equal(preferJoined(2, 1), false);
});
