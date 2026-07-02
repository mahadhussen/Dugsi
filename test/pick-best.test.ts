import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBestAlternative } from "../lib/speech/pickBest";
import { tokenize } from "../lib/arabic";

const expected = new Set(tokenize("بسم الله الرحمن الرحيم الحمد لله رب العالمين"));

test("prefers the alternative matching the Quran text over the top guess", () => {
  const alts = [
    "بسم الله رحمن رحيم شيء", // top guess, slightly off
    "بسم الله الرحمن الرحيم", // exact verse wording
  ];
  assert.equal(pickBestAlternative(alts, expected), alts[1]);
});

test("keeps the top guess when it is already the best match", () => {
  const alts = ["الحمد لله رب العالمين", "الحمد لله رب العالم"];
  assert.equal(pickBestAlternative(alts, expected), alts[0]);
});

test("single or empty alternatives pass through", () => {
  assert.equal(pickBestAlternative(["فقط"], expected), "فقط");
  assert.equal(pickBestAlternative([], expected), "");
});
