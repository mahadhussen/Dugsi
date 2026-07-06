import { test } from "node:test";
import assert from "node:assert/strict";
import { bestAnchor } from "../lib/analyze";
import { normalizeWord } from "../lib/arabic";

// Distinct pure-Arabic tokens (no digits — normalizeWord strips non-Arabic).
const R = ["رحيم", "رحمن", "ملك", "نور", "قدوس"]; // a 5-word refrain
const FILL = ["سلام", "مؤمن", "عزيز"];
const TAIL = ["كتاب", "قلم", "باب", "بيت", "شمس", "قمر", "نجم", "بحر", "جبل", "نهر"];

const n = (arr: string[]) => arr.map(normalizeWord);

test("a long window disambiguates a repeated refrain (5 probes would tie)", () => {
  // Refrain appears twice; only the second is followed by the unique TAIL.
  const expected = n([
    "بسم",
    "الله", // 0,1
    ...R, // 2..6  (occurrence 1, followed by FILL)
    ...FILL, // 7,8,9
    ...R, // 10..14 (occurrence 2, followed by TAIL)
    ...TAIL, // 15..24
  ]);
  const heard = n([...R, ...TAIL.slice(0, 6)]); // refrain + its real continuation
  // The true start is 10. With only the 5-word refrain both 2 and 10 tie and the
  // old code took the first (2); the longer window sees the TAIL and picks 10.
  assert.equal(bestAnchor(expected, heard), 10);
});

test("the live-tracker hint breaks a tie between identical repetitions", () => {
  // Build a reference where the exact same phrase sits at index 3 and index 40,
  // with nothing after either to distinguish them.
  const phrase = R;
  const filler = (k: number, len: number) =>
    Array.from({ length: len }, (_, i) => `حرف${"ا".repeat(k)}${"ب".repeat(i + 1)}`);
  const expected = n([
    ...filler(1, 3), // 0..2
    ...phrase, // 3..7
    ...filler(2, 27), // 8..34
    ...phrase, // 35..39  (identical copy)
    ...filler(3, 5), // 40..44
  ]);
  const heard = n(phrase); // just the phrase — genuinely ambiguous
  assert.equal(bestAnchor(expected, heard), 3, "no hint → first occurrence");
  assert.equal(bestAnchor(expected, heard, 35), 35, "hint near the second → second occurrence");
});

test("a unique passage is found without a hint", () => {
  const expected = n(["بسم", "الله", ...FILL, ...TAIL]);
  const heard = n(TAIL.slice(0, 5));
  assert.equal(bestAnchor(expected, heard), 5);
});

test("empty heard falls back to the hint, or 0", () => {
  const expected = n([...FILL, ...TAIL]);
  assert.equal(bestAnchor(expected, []), 0);
  assert.equal(bestAnchor(expected, [], 4), 4);
});
