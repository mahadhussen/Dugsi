import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGE_COUNT, lastPageOf, pageOf, pageStart, surahStartPage, surahsOnPages, isSegments, type Page } from "../lib/quran/layout";
import { fatiha } from "../lib/quran/fatiha";
import INDEX from "../lib/quran/layout/index.json";

function wordCounts(): number[][] {
  const out: number[][] = [fatiha.ayat.map((a) => a.words.length)];
  for (let s = 2; s <= 114; s++) {
    const d = JSON.parse(readFileSync(`lib/quran/data/${s}.json`, "utf8")) as { verses: { text: string }[] };
    out.push(d.verses.map((v) => v.text.split(/\s+/).filter(Boolean).length));
  }
  return out;
}

function allPages(): Page[] {
  const pages: Page[] = [];
  for (let f = 1; f <= Math.ceil(PAGE_COUNT / INDEX.pagesPerFile); f++) {
    pages.push(...(JSON.parse(readFileSync(`lib/quran/layout/pages-${f}.json`, "utf8")) as Page[]));
  }
  return pages;
}

test("the printed mushaf has 604 pages of 15 lines (8 on the framed first two)", () => {
  const pages = allPages();
  assert.equal(pages.length, 604);
  pages.forEach((p, i) => assert.equal(p.length, i < 2 ? 8 : 15, `page ${i + 1}`));
});

test("every word of every ayah appears exactly once, in order, with 6236 markers", () => {
  const counts = wordCounts();
  const pages = allPages();
  let s = 1;
  let a = 1;
  let w = 0;
  let markers = 0;
  let banners = 0;
  let basmalas = 0;
  for (const page of pages) {
    for (const line of page) {
      if (!isSegments(line)) {
        if (line[0] === "h") banners++;
        else basmalas++;
        continue;
      }
      for (const [ss, aa, w0, w1, m] of line) {
        assert.equal(ss, s, `surah at ${s}:${a}:${w}`);
        assert.equal(aa, a, `ayah at ${s}:${a}:${w}`);
        assert.equal(w0, w, `word at ${s}:${a}:${w}`);
        w = w1;
        if (m) {
          markers++;
          assert.equal(w, counts[s - 1][a - 1], `marker after the last word of ${s}:${a}`);
          w = 0;
          a++;
          if (a > counts[s - 1].length) {
            s++;
            a = 1;
          }
        }
      }
    }
  }
  assert.equal(s, 115);
  assert.equal(markers, 6236);
  assert.equal(banners, 114);
  assert.equal(basmalas, 112); // none before Al-Fatiha (it is verse 1) or At-Tawbah
});

test("page numbers match the Madinah mushaf", () => {
  assert.equal(pageOf(1, 1), 1);
  assert.equal(pageOf(2, 1), 2);
  assert.equal(pageOf(2, 255), 42); // Ayat al-Kursi
  assert.equal(pageOf(18, 1), 293); // Al-Kahf
  assert.equal(pageOf(36, 1), 440); // Ya-Sin
  assert.equal(pageOf(67, 1), 562); // Al-Mulk
  assert.equal(pageOf(114, 6), 604);
  assert.equal(lastPageOf(2, 282), pageOf(2, 282));
  assert.equal(surahStartPage(9), 187);
  assert.equal(surahStartPage(112), 604);
  assert.deepEqual(pageStart(2), { surah: 2, ayah: 1 });
  assert.deepEqual(pageStart(604), { surah: 112, ayah: 1 });
});

test("surahsOnPages lists every surah that appears, in order", () => {
  const pages = allPages();
  assert.deepEqual(surahsOnPages([pages[603]]), [112, 113, 114]);
  assert.deepEqual(surahsOnPages([pages[0], pages[1]]), [1, 2]);
});
