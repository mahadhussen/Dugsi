// Real output of Tarteel's Quran model on 145 recordings, counted the way
// General Naadir counted them: how often a reading that was right is accused
// (a word "wrong" or "skipped"), and how often a real mistake is caught.
//
//   masters  17 master readings of Al-Fatiha (Akhdar, Qahtani, Sudais, Alafasy:
//            clean, phone band with noise, 1.12x and 0.9x; everyayah)
//   correct  54 right readings over 27 surahs (macOS Majed voice), verse by
//            verse (_v) and in breaths across verses (_b)
//   skip     24 readings with one verse left out
//   wrong    50 readings with one word said as another
//
// The ceilings are what the follower does today; a change that raises one
// must say why. "Fel dom är värre än ingen dom": the accusation counts may
// only go down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { loadSurah } from "../lib/quran";
import { flattenAyat } from "../lib/quran/types";
import { runFixture, type Fixture } from "../lib/follow/fixture";

const DIR = "test/fixtures/recite/corpus";

async function judged(kind: string) {
  const out: { fx: Fixture; at: (s: string) => string[]; loc: (k: number) => string; words: { refIndex: number; status: string }[] }[] = [];
  for (const f of readdirSync(`${DIR}/${kind}`).filter((x) => x.endsWith(".json")).sort()) {
    const fx = JSON.parse(readFileSync(`${DIR}/${kind}/${f}`, "utf8")) as Fixture;
    const surah = await loadSurah(fx.surah);
    const flat = flattenAyat(surah.ayat);
    const { verdict } = runFixture(fx, surah.ayat);
    const loc = (k: number) => `${flat[k].ayah}:${flat[k].indexInAyah + 1}`;
    const words = verdict.alignment.words;
    out.push({ fx, loc, words, at: (st) => words.filter((w) => w.status === st).map((w) => loc(w.refIndex)) });
  }
  return out;
}

const list = (rows: { fx: Fixture; at: (s: string) => string[] }[], st: string) =>
  rows.flatMap((r) => r.at(st).map((l) => `${r.fx.name} ${l}`));

test("17 master readings: no word skipped, one known word wrong", async () => {
  const rows = await judged("masters");
  assert.equal(rows.length, 17);
  assert.deepEqual(list(rows, "missing"), []);
  // Qahtani at 1.12x: the model writes "الحمل لا يرب" for "الحمد لله رب" —
  // a real word for a real word, which no rule on letters can tell apart.
  assert.deepEqual(list(rows, "wrong"), ["qahtani-fast 2:2"]);
});

test("54 right readings by another voice: at most 7 words wrong, 6 skipped", async () => {
  const rows = await judged("correct");
  assert.equal(rows.length, 54);
  const wrong = list(rows, "wrong");
  const missing = list(rows, "missing");
  assert.ok(wrong.length <= 7, `wrong ${wrong.length}: ${wrong.join(", ")}`);
  assert.ok(missing.length <= 6, `skipped ${missing.length}: ${missing.join(", ")}`);
});

test("24 readings with a verse left out: the verse is skipped, little else is accused", async () => {
  const rows = await judged("skip");
  assert.equal(rows.length, 24);
  let caught = 0;
  let inVerse = 0;
  const elsewhere: string[] = [];
  for (const r of rows) {
    const k = (r.fx.expect as { skipVerse: number }).skipVerse;
    for (const w of r.words) {
      const l = r.loc(w.refIndex);
      const v = Number(l.split(":")[0]);
      if (v === k) {
        inVerse++;
        if (w.status === "missing") caught++;
      } else if (w.status === "wrong" || w.status === "missing") elsewhere.push(`${r.fx.name} ${l}=${w.status}`);
    }
  }
  assert.ok(caught >= 114, `skipped words caught ${caught}/${inVerse}`);
  assert.ok(elsewhere.length <= 16, `accused elsewhere ${elsewhere.length}: ${elsewhere.join(", ")}`);
});

test("50 readings with one word changed: 48 caught as wrong, little else accused", async () => {
  const rows = await judged("wrong");
  assert.equal(rows.length, 50);
  let caught = 0;
  const elsewhere: string[] = [];
  for (const r of rows) {
    const at = (r.fx.expect as { wrongAt: string }).wrongAt;
    for (const w of r.words) {
      const l = r.loc(w.refIndex);
      if (l === at) caught += w.status === "wrong" ? 1 : 0;
      else if (w.status === "wrong" || w.status === "missing") elsewhere.push(`${r.fx.name} ${l}=${w.status}`);
    }
  }
  assert.ok(caught >= 48, `caught ${caught}/50`);
  assert.ok(elsewhere.length <= 2, `accused elsewhere ${elsewhere.length}: ${elsewhere.join(", ")}`);
});
