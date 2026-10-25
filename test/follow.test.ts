// The follower and its verdict, tested two ways:
//   1. on real output of Tarteel's Quran model (test/fixtures/recite, recorded
//      with scripts/eval/transcribe.ts from real recitations and deliberate
//      mistakes) — the facts each fixture must produce are written below;
//   2. on small hand-made cases for the rules themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadSurah } from "../lib/quran";
import { flattenAyat, type Ayah } from "../lib/quran/types";
import { runFixture, type Fixture } from "../lib/follow/fixture";
import { buildRef } from "../lib/follow/text";
import { applyHint, applyPiece, createFollower, liveMarks, type PieceInput } from "../lib/follow/follower";
import { verdictOf } from "../lib/follow/verdict";
import { alignWindow, placePiece } from "../lib/follow/align";
import { wordSim, spoken, CORRECT } from "../lib/follow/phonetic";
import { tokenize } from "../lib/arabic";

const fixture = (name: string): Fixture => JSON.parse(readFileSync(`test/fixtures/recite/${name}.json`, "utf8"));

async function run(name: string) {
  const fx = fixture(name);
  const surah = await loadSurah(fx.surah);
  const flat = flattenAyat(surah.ayat);
  const out = runFixture(fx, surah.ayat);
  const where = (status: string) =>
    out.verdict.alignment.words.filter((w) => w.status === status).map((w) => `${flat[w.refIndex].ayah}:${flat[w.refIndex].indexInAyah + 1}`);
  return { ...out, flat, where };
}

const verse = (flat: { ayah: number; indexInAyah: number }[], v: number) =>
  flat.filter((f) => f.ayah === v).map((f) => `${f.ayah}:${f.indexInAyah + 1}`);

// ── Real recitations: a perfect reciter must never be accused ─────────────

for (const name of ["afasy-fatiha", "husary-ikhlas", "afasy-baqarah-1-20"]) {
  test(`${name}: a master's recitation gets no wrong, skipped or unclear word`, async () => {
    const { verdict, state, where } = await run(name);
    assert.equal(verdict.reliable, true);
    assert.deepEqual(where("wrong"), []);
    assert.deepEqual(where("missing"), []);
    assert.deepEqual(where("unclear"), []);
    assert.equal(state.cursor, verdict.alignment.words.at(-1)!.refIndex + 1, "the cursor ends at the last recited word");
  });
}

test("afasy-fatiha: no madd is called rushed on Alafasy", async () => {
  const { verdict } = await run("afasy-fatiha");
  assert.deepEqual(verdict.timing.checks.filter((c) => c.verdict === "rushed"), []);
});

// ── Mahad's case: a verse read, but not caught ────────────────────────────

test("afasy-baqarah-masked4: a verse drowned in noise is unclear, never skipped, and the follow keeps up", async () => {
  const { verdict, state, where, flat } = await run("afasy-baqarah-masked4");
  assert.equal(verdict.reliable, true);
  assert.deepEqual(where("missing"), [], "nothing may be called skipped");
  assert.deepEqual(where("wrong"), [], "nothing may be called wrong");
  for (const w of verse(flat, 4)) assert.ok(where("unclear").includes(w), `${w} should be unclear`);
  const lastOf20 = flat.findLastIndex((f) => f.ayah === 20);
  assert.equal(state.cursor, lastOf20 + 1, "the cursor reaches the end of verse 20");
  assert.match(verdict.summary, /could not hear clearly/);
});

test("afasy-baqarah-skip4: a verse really left out is skipped, word for word", async () => {
  const { verdict, where, flat } = await run("afasy-baqarah-skip4");
  assert.equal(verdict.reliable, true);
  assert.deepEqual(where("missing"), verse(flat, 4));
  assert.deepEqual(where("wrong"), []);
});

// ── Deliberate mistakes (synthetic voice) ─────────────────────────────────

test("tts-fatiha-skip-verse3: the skipped verse and nothing else", async () => {
  const { where, flat } = await run("tts-fatiha-skip-verse3");
  assert.deepEqual(where("missing"), verse(flat, 3));
});

test("tts-fatiha-skip-word: exactly the left-out word", async () => {
  const { where } = await run("tts-fatiha-skip-word");
  assert.deepEqual(where("missing"), ["2:2"]);
});

test("tts-fatiha-wrong-word: the replaced word is not passed as correct", async () => {
  const { verdict, flat } = await run("tts-fatiha-wrong-word");
  const w = verdict.alignment.words.find((x) => flat[x.refIndex].ayah === 2 && flat[x.refIndex].indexInAyah === 3);
  assert.ok(w && (w.status === "wrong" || w.status === "missing"), `2:4 was ${w?.status}`);
});

test("tts-fatiha-repeat: reading a verse twice is no mistake and adds no words", async () => {
  const { verdict, where } = await run("tts-fatiha-repeat");
  assert.deepEqual(where("missing"), []);
  assert.deepEqual(where("wrong"), []);
  assert.deepEqual(verdict.extras, []);
});

test("tts-ikhlas-preamble: isti'adha and basmala before Al-Ikhlas are a preface", async () => {
  const { verdict, state } = await run("tts-ikhlas-preamble");
  assert.deepEqual(state.pieces.slice(0, 2).map((p) => p.kind), ["preamble", "preamble"]);
  assert.deepEqual(verdict.extras, []);
  assert.equal(verdict.alignment.words[0].refIndex, 0, "the surah starts at its first word");
});

test("afasy-fatiha: the basmala of Al-Fatiha is its first verse, not a preface", async () => {
  const { state } = await run("afasy-fatiha");
  assert.equal(state.pieces[0].kind, "aligned");
  assert.equal(state.pieces[0].align!.start, 0);
});

test("afasy-fatiha-phone: through a phone band, noise and 12 % faster it still follows to the end", async () => {
  const { verdict, state, where } = await run("afasy-fatiha-phone");
  assert.equal(verdict.reliable, true);
  assert.equal(state.cursor, 29);
  assert.deepEqual(where("missing"), []);
  // Known limit, measured: the telephone band strips the "s" of بِسْمِ.
  assert.ok(where("wrong").length <= 1);
});

// ── The rules, one by one ─────────────────────────────────────────────────

test("spelling differences between Uthmani and modern script are the same word", () => {
  const pairs = [
    ["ٱلصَّلَوٰةَ", "الصلاة"],
    ["ذَٰلِكَ", "ذالك"],
    ["إِبْرَٰهِـۧمَ", "إبراهيم"],
    ["ٱلسَّمَٰوَٰتِ", "السماوات"],
  ];
  for (const [u, m] of pairs) assert.ok(wordSim(spoken(u), spoken(m)) >= CORRECT, `${u} vs ${m}: ${wordSim(spoken(u), spoken(m))}`);
  // ...but a changed consonant is not
  assert.ok(wordSim(spoken("قَلْب"), spoken("كلب")) < CORRECT);
});

test("a word the recogniser split in two still lines up", () => {
  const ref = buildRef([{ number: 6, words: ["ٱهْدِنَا", "ٱلصِّرَٰطَ", "ٱلْمُسْتَقِيمَ"].map((uthmani) => ({ uthmani })) }]);
  const a = alignWindow(ref, tokenize("إذ دنا الصراط المستقيم"), 0, 3, () => 0)!;
  assert.equal(a.pairs[0].heardEnd - a.pairs[0].heard, 2);
  assert.deepEqual(a.skipped, []);
});

function ayatOf(texts: string[]): Ayah[] {
  return texts.map((t, i) => ({ number: i + 1, words: t.split(" ").map((uthmani) => ({ uthmani })) }));
}
const piece = (id: number, text: string, t0 = id * 5): PieceInput => ({ id, t0, t1: t0 + 4, text, source: "browser" });

test("a long verse the recogniser missed: the next verse is found far ahead", async () => {
  const baqarah = await loadSurah(2);
  const ref = buildRef(baqarah.ayat);
  const start282 = ref.verseFirst.get(282)!;
  const start283 = ref.verseFirst.get(283)!;
  assert.ok(start283 - start282 > 100, "2:282 is the longest verse");
  const next = tokenize(baqarah.ayat[282].words.slice(0, 8).map((w) => w.uthmani).join(" "));
  const p = placePiece(ref, next, start282, 0, ref.norm.length)!;
  assert.equal(p.align.start, start283);
  assert.equal(p.jumped, true);
});

test("one look-alike word far away does not move the cursor", () => {
  const ayat = ayatOf(["بسم الله الرحمن الرحيم", "الحمد لله رب العالمين", "الرحمن الرحيم", "مالك يوم الدين", "اياك نعبد واياك نستعين", "اهدنا الصراط المستقيم", "صراط الذين انعمت عليهم غير المغضوب عليهم ولا الضالين"]);
  let s = createFollower(buildRef(ayat));
  for (const [i, v] of ayat.entries()) s = applyPiece(s, piece(i, v.words.map((w) => w.uthmani).join(" ")));
  const before = s.cursor;
  s = applyPiece(s, piece(9, "طسم"));
  assert.equal(s.cursor, before);
  assert.equal(s.pieces.at(-1)!.kind, "unclear");
});

test("hints move the cursor on screen but never mark a word", () => {
  const ayat = ayatOf(["قل هو الله احد", "الله الصمد", "لم يلد ولم يولد", "ولم يكن له كفوا احد"]);
  let s = createFollower(buildRef(ayat));
  s = applyHint(s, "قل هو الله احد الله الصمد");
  assert.equal(s.live, 6);
  assert.equal(s.cursor, 0);
  assert.deepEqual(liveMarks(s), {});
});

test("the old tracker's failure case: after a verse it could not catch, every later word is still followed", async () => {
  // Same scenario as scripts/eval/old-tracker.ts, where the old tracker marked 9/64.
  const baqarah = await loadSurah(2);
  const ayat = baqarah.ayat.slice(0, 10);
  let s = createFollower(buildRef(ayat));
  ayat.forEach((a, i) => {
    const text = a.number === 4 ? "و اه ممم يا نن سس" : a.words.map((w) => w.uthmani).join(" ");
    s = applyPiece(s, piece(i, text));
  });
  const marks = liveMarks(s);
  const flat = flattenAyat(ayat);
  const after = flat.map((f, i) => ({ f, i })).filter(({ f }) => f.ayah >= 5);
  const followed = after.filter(({ i }) => marks[i] === "correct").length;
  assert.equal(followed, after.length);
  assert.equal(s.cursor, flat.length);
});

test("a recitation starting at verse 3 does not grey out verses 1 and 2", () => {
  const ayat = ayatOf(["قل هو الله احد", "الله الصمد", "لم يلد ولم يولد", "ولم يكن له كفوا احد"]);
  let s = createFollower(buildRef(ayat));
  s = applyPiece(s, piece(0, "لم يلد ولم يولد"));
  const marks = liveMarks(s);
  for (let i = 0; i < 6; i++) assert.equal(marks[i], undefined);
});

test("a practice range: a piece from outside it is not placed there", () => {
  const ayat = ayatOf(["قل هو الله احد", "الله الصمد", "لم يلد ولم يولد", "ولم يكن له كفوا احد"]);
  const ref = buildRef(ayat);
  let s = createFollower(ref, { start: ref.verseFirst.get(3)!, end: ref.norm.length });
  s = applyPiece(s, piece(0, "قل هو الله احد"));
  assert.notEqual(s.pieces[0].align?.start, 0);
});

test("a joined re-decode replaces both pieces and replays the rest the same way", () => {
  const ayat = ayatOf(["الحمد لله رب العالمين", "الرحمن الرحيم", "مالك يوم الدين"]);
  let s = createFollower(buildRef(ayat));
  s = applyPiece(s, piece(0, "الحمد لله رب العا"));
  s = applyPiece(s, piece(1, "لمين"));
  s = applyPiece(s, piece(2, "الرحمن الرحيم مالك يوم الدين"));
  s = applyPiece(s, { ...piece(10, "الحمد لله رب العالمين"), replaces: [0, 1] });
  assert.deepEqual(s.pieces.map((p) => p.input.id), [10, 2]);
  const v = verdictOf(s, { words: flattenAyat(ayat).map((f) => f.word), engine: "test" });
  assert.equal(v.alignment.words.filter((w) => w.status === "correct").length, 9);
});

test("garbage in: no verdict, rather than a wrong one", () => {
  const ayat = ayatOf(["قل هو الله احد", "الله الصمد", "لم يلد ولم يولد", "ولم يكن له كفوا احد"]);
  let s = createFollower(buildRef(ayat));
  s = applyPiece(s, piece(0, "سس ممم ههه"));
  s = applyPiece(s, piece(1, "ثث خخ"));
  const v = verdictOf(s, { words: flattenAyat(ayat).map((f) => f.word), engine: "test" });
  assert.equal(v.reliable, false);
});
