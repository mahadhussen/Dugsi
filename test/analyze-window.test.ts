import { test } from "node:test";
import assert from "node:assert/strict";
import data from "../lib/quran/data/baqarah.json";
import { analyzeRecitation } from "../lib/analyze";
import type { Ayah } from "../lib/quran/types";

function buildAyat(): Ayah[] {
  return data.verses.map((v: { n: number; text: string }) => ({
    number: v.n,
    words: v.text
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => ({ uthmani: t })),
  }));
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

test("long surah analysis windows to the recited passage (no full-surah matrix)", () => {
  const ayat = buildAyat(); // all 286 verses ≈ 6118 words
  const v255 = data.verses[254].text; // Ayat al-Kursi, mid-surah

  const start = Date.now();
  const fb = analyzeRecitation(ayat, v255, [], "test");
  const ms = Date.now() - start;

  // Verbatim verse → high accuracy.
  assert.ok(fb.alignment.accuracy > 0.8, `accuracy too low: ${fb.alignment.accuracy}`);
  assert.ok(fb.alignment.words.length > 0);

  // Matched words map to verse 255's global position, not the start of the surah.
  let globalStart = 0;
  for (let i = 0; i < 254; i++) globalStart += wordCount(data.verses[i].text);
  const firstRef = fb.alignment.words[0].refIndex;
  assert.ok(
    Math.abs(firstRef - globalStart) < 40,
    `expected refIndex near ${globalStart}, got ${firstRef}`,
  );

  // Should be fast (windowed), not a 6118-wide matrix.
  assert.ok(ms < 1500, `analysis too slow: ${ms}ms`);
});
