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
// and a second set General Naadir made later, which the rules were not tuned on:
//
//   masters-degraded   18 of the masters with echo, noise, a room, 32 kbit/s
//   correct-more       40 right readings (Majed) of 20 other surahs
//   word-by-word       10 right readings, one word per piece
//   skip-word-by-word  17 word-by-word readings with one verse left out
//   wrong-more         28 misreadings of other kinds (inflection, mutashabih…)
//
// and a third, again unseen when the rules were written:
//
//   masters-classroom  16 of the masters under another reciter's murmur, brown
//                      noise, a quiet voice, slow in a reverberant room
//   masters-cut        24 real skips cut out of the masters' clean recordings
//                      (a whole verse, or one word)
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

// A word said with the right letters but a wrong short vowel is counted on its
// own (vowels): the letter ceilings below are unchanged by vowel judging.
async function judged(kind: string) {
  const out: {
    fx: Fixture;
    at: (s: string) => string[];
    loc: (k: number) => string;
    words: { refIndex: number; status: string }[];
    vowels: string[];
  }[] = [];
  for (const f of readdirSync(`${DIR}/${kind}`).filter((x) => x.endsWith(".json")).sort()) {
    const fx = JSON.parse(readFileSync(`${DIR}/${kind}/${f}`, "utf8")) as Fixture;
    const surah = await loadSurah(fx.surah);
    const flat = flattenAyat(surah.ayat);
    const { verdict } = runFixture(fx, surah.ayat);
    const loc = (k: number) => `${flat[k].ayah}:${flat[k].indexInAyah + 1}`;
    const vowelAt = new Set(verdict.mistakes.filter((m) => m.vowel).map((m) => m.refIndex));
    const words = verdict.alignment.words.map((w) => (vowelAt.has(w.refIndex) ? { ...w, status: "vowel" } : w));
    out.push({ fx, loc, words, at: (st) => words.filter((w) => w.status === st).map((w) => loc(w.refIndex)), vowels: [...vowelAt].map(loc) });
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

test("54 right readings by another voice: at most 7 words wrong, none skipped", async () => {
  const rows = await judged("correct");
  assert.equal(rows.length, 54);
  const wrong = list(rows, "wrong");
  const missing = list(rows, "missing");
  assert.ok(wrong.length <= 7, `wrong ${wrong.length}: ${wrong.join(", ")}`);
  assert.deepEqual(missing, []);
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
  assert.ok(elsewhere.length <= 9, `accused elsewhere ${elsewhere.length}: ${elsewhere.join(", ")}`);
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
  assert.ok(elsewhere.length <= 1, `accused elsewhere ${elsewhere.length}: ${elsewhere.join(", ")}`);
});

// ── The held-out set ──────────────────────────────────────────────────────

const tally = (rows: Awaited<ReturnType<typeof judged>>) => ({ wrong: list(rows, "wrong"), missing: list(rows, "missing") });

test("18 degraded master readings (echo, noise, room, low bit rate): nothing skipped, two known words wrong", async () => {
  const rows = await judged("masters-degraded");
  assert.equal(rows.length, 18);
  const { wrong, missing } = tally(rows);
  assert.deepEqual(missing, []);
  assert.ok(wrong.length <= 2, `wrong ${wrong.join(", ")}`);
});

test("40 more right readings: at most 20 words wrong, none skipped", async () => {
  const rows = await judged("correct-more");
  assert.equal(rows.length, 40);
  const { wrong, missing } = tally(rows);
  assert.deepEqual(missing, []);
  // Mostly a short word the model heard as another short word ("من", "لم"):
  // see NEEDS-DECISION 4 in WORKLOG.
  assert.ok(wrong.length <= 20, `wrong ${wrong.length}: ${wrong.join(", ")}`);
});

test("10 right readings word by word: nothing accused", async () => {
  const rows = await judged("word-by-word");
  assert.equal(rows.length, 10);
  assert.deepEqual(tally(rows), { wrong: [], missing: [] });
});

test("17 word-by-word readings with a verse left out: 50 of its 73 words caught, at most 6 accused beside it", async () => {
  const rows = await judged("skip-word-by-word");
  assert.equal(rows.length, 17);
  let caught = 0;
  const elsewhere: string[] = [];
  for (const r of rows) {
    const k = (r.fx.expect as { skipVerse: number }).skipVerse;
    for (const w of r.words) {
      const l = r.loc(w.refIndex);
      if (Number(l.split(":")[0]) === k) caught += w.status === "missing" ? 1 : 0;
      else if (w.status === "wrong" || w.status === "missing") elsewhere.push(`${r.fx.name} ${l}=${w.status}`);
    }
  }
  assert.ok(caught >= 50, `caught ${caught}/73`);
  assert.ok(elsewhere.length <= 6, `accused elsewhere ${elsewhere.length}: ${elsewhere.join(", ")}`);
});

test("28 more misreadings: at least 12 caught, at most 3 other words accused", async () => {
  const rows = await judged("wrong-more");
  assert.equal(rows.length, 28);
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
  assert.ok(caught >= 12, `caught ${caught}/28`);
  assert.ok(elsewhere.length <= 3, `accused elsewhere ${elsewhere.length}: ${elsewhere.join(", ")}`);
});

// ── The second held-out set ───────────────────────────────────────────────

test("16 masters in a classroom murmur, noise or a quiet voice: nothing skipped, three known words wrong", async () => {
  const rows = await judged("masters-classroom");
  assert.equal(rows.length, 16);
  const { wrong, missing } = tally(rows);
  assert.deepEqual(missing, []);
  assert.ok(wrong.length <= 3, `wrong ${wrong.join(", ")}`);
});

test("24 skips cut out of master recordings: 9 of 10 verse words and 10 of 20 single words caught, one other accused", async () => {
  const rows = await judged("masters-cut");
  assert.equal(rows.length, 24);
  let verseCaught = 0;
  let wordCaught = 0;
  const elsewhere: string[] = [];
  for (const r of rows) {
    const e = r.fx.expect as { skipVerse?: number; skipWord?: string };
    const isTarget = (l: string) => (e.skipVerse ? Number(l.split(":")[0]) === e.skipVerse : l === e.skipWord);
    for (const w of r.words) {
      const l = r.loc(w.refIndex);
      if (isTarget(l)) {
        if (w.status === "missing") e.skipVerse ? verseCaught++ : wordCaught++;
      } else if (w.status === "wrong" || w.status === "missing") elsewhere.push(`${r.fx.name} ${l}=${w.status}`);
    }
  }
  assert.ok(verseCaught >= 9, `verse words caught ${verseCaught}/10`);
  assert.ok(wordCaught >= 10, `single words caught ${wordCaught}/20`);
  assert.ok(elsewhere.length <= 1, `accused elsewhere ${elsewhere.length}: ${elsewhere.join(", ")}`);
});

// ── Vowels: right readings accused of a wrong vowel ───────────────────────
// The model writes the vowels it hears, and now and then a wrong one on a
// master's right reading (Qahtani's "ٱلرَّحْمَٰنِ" as -nu, Sudais's
// "ٱلْمَغْضُوبِ" as mu-, both in degraded audio). Ceilings as measured.

const VOWEL_CEILING: Record<string, number> = {
  masters: 1,
  "masters-degraded": 6,
  "masters-classroom": 3,
  "masters-cut": 1,
  correct: 1,
  "correct-more": 1,
  "word-by-word": 0,
  skip: 0,
  "skip-word-by-word": 0,
  wrong: 2,
  "wrong-more": 0,
  vowel: 0,
};

test("wrong-more: inflection mistakes (a wrong vowel) are now caught as the mistake", async () => {
  const rows = await judged("wrong-more");
  const caughtAsVowel = rows.filter((r) => r.vowels.includes((r.fx.expect as { wrongAt: string }).wrongAt));
  assert.ok(caughtAsVowel.length >= 1, "no inflection mistake caught by its vowel");
});
for (const [kind, ceiling] of Object.entries(VOWEL_CEILING)) {
  test(`${kind}: at most ${ceiling} right word${ceiling === 1 ? "" : "s"} accused of a wrong vowel`, async () => {
    const rows = await judged(kind);
    // The deliberate mistake itself is not a false accusation (some are vowels).
    const target = (r: (typeof rows)[number]) => {
      const e = r.fx.expect as { wrongAt?: string; vowelAt?: string } | undefined;
      return e?.wrongAt ?? e?.vowelAt;
    };
    const vowels = rows.flatMap((r) => r.vowels.filter((l) => l !== target(r)).map((l) => `${r.fx.name} ${l}`));
    assert.ok(vowels.length <= ceiling, `vowel accusations ${vowels.length}: ${vowels.join(", ")}`);
  });
}

test("49 readings with one vowel said wrong: caught on the word, nothing else accused of a vowel", async () => {
  const rows = await judged("vowel");
  assert.equal(rows.length, 49);
  let inside = 0;
  let ending = 0;
  for (const r of rows) {
    const e = r.fx.expect as { vowelAt: string; ending: boolean };
    if (!r.vowels.includes(e.vowelAt)) continue;
    if (e.ending) ending++;
    else inside++;
  }
  // Missed ones are words the model spelled with other letters: then the
  // vowels are not compared at all (never a false accusation).
  assert.ok(inside >= 11, `inside a word caught ${inside}/25`);
  assert.ok(ending >= 16, `endings caught ${ending}/24`);
});
