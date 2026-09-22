import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRef, prevRef } from "../lib/listen-engine";
import { surahAyahUrls } from "../lib/audio-cache";
import { surahMeta } from "../lib/quran";

test("the recitation flows from one verse to the next", () => {
  assert.deepEqual(nextRef({ surah: 2, verse: 1 }, false), { surah: 2, verse: 2 });
  assert.deepEqual(prevRef({ surah: 2, verse: 2 }), { surah: 2, verse: 1 });
});

test("the last verse of a surah leads into the next surah, not into a gap", () => {
  // Al-Baqarah has 286 verses; after the last one comes Al-Imran, verse 1.
  assert.equal(surahMeta(2)!.ayahCount, 286);
  assert.deepEqual(nextRef({ surah: 2, verse: 286 }, false), { surah: 3, verse: 1 });
  // And stepping back from the start of a surah lands on the last verse of the
  // one before it, so the previous button never dead-ends.
  assert.deepEqual(prevRef({ surah: 3, verse: 1 }), { surah: 2, verse: 286 });
});

test("every surah boundary in the Quran has somewhere to go", () => {
  for (let s = 1; s <= 113; s++) {
    const last = surahMeta(s)!.ayahCount;
    assert.deepEqual(nextRef({ surah: s, verse: last }, false), { surah: s + 1, verse: 1 }, `after ${s}:${last}`);
    assert.deepEqual(prevRef({ surah: s + 1, verse: 1 }), { surah: s, verse: last }, `before ${s + 1}:1`);
  }
});

test("the Quran ends, and starts, without wrapping around", () => {
  assert.equal(nextRef({ surah: 114, verse: surahMeta(114)!.ayahCount }, false), null);
  assert.equal(prevRef({ surah: 1, verse: 1 }), null);
});

test("repeat sends the last verse back to the first of the same surah", () => {
  assert.deepEqual(nextRef({ surah: 36, verse: surahMeta(36)!.ayahCount }, true), { surah: 36, verse: 1 });
  // Mid-surah, repeat changes nothing.
  assert.deepEqual(nextRef({ surah: 36, verse: 1 }, true), { surah: 36, verse: 2 });
});

test("saving a surah covers every one of its verses, in order", () => {
  const urls = surahAyahUrls(112, "alafasy");
  assert.equal(urls.length, surahMeta(112)!.ayahCount);
  assert.ok(urls[0].endsWith("/112001.mp3"), urls[0]);
  assert.ok(urls[3].endsWith("/112004.mp3"), urls[3]);
  assert.equal(surahAyahUrls(999, "alafasy").length, 0);
});
