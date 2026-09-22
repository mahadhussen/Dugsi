import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { wordAt, TIMED_RECITERS } from "../lib/quran/timings";
import data from "../lib/quran/data/2.json";

test("wordAt maps a time inside the ayah to the word being recited", () => {
  const t: [number, number][] = [
    [60, 610],
    [620, 1310],
    [1320, 2450],
  ];
  assert.equal(wordAt(t, 0), -1); // before the first word
  assert.equal(wordAt(t, 100), 0);
  assert.equal(wordAt(t, 615), 0); // in the gap → still the previous word
  assert.equal(wordAt(t, 1000), 1);
  assert.equal(wordAt(t, 9999), 2); // past the end → last word
  assert.equal(wordAt(undefined, 100), -1);
});

test("every timed reciter has a timing file for all 114 surahs", () => {
  for (const id of TIMED_RECITERS) {
    for (let s = 1; s <= 114; s++) {
      assert.ok(existsSync(`lib/quran/timings/${id}/${s}.json`), `${id}/${s}.json missing`);
    }
  }
});

test("timing rows match the verse word count and are monotonic (Al-Baqarah, Alafasy)", () => {
  const timings = JSON.parse(readFileSync("lib/quran/timings/alafasy/2.json", "utf8")) as Record<string, [number, number][]>;
  let checked = 0;
  for (const v of data.verses) {
    const row = timings[String(v.n)];
    if (!row) continue; // ayat whose segmentation differed were deliberately left out
    const words = v.text.split(/\s+/).filter(Boolean).length;
    assert.equal(row.length, words, `verse ${v.n}`);
    for (let i = 1; i < row.length; i++) assert.ok(row[i][0] >= row[i - 1][0], `verse ${v.n} word ${i} not monotonic`);
    checked++;
  }
  assert.ok(checked > 280, `only ${checked} verses timed`);
});
