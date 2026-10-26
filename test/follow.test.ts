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
import { applyHint, applyPiece, createFollower, placeInput, statusOfPair, type PieceInput } from "../lib/follow/follower";
import { liveMarks, verdictOf } from "../lib/follow/verdict";
import { alignWindow, placePiece } from "../lib/follow/align";
import { wordSim, spoken, CLOSE, CORRECT } from "../lib/follow/phonetic";
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

test("tts-fatiha-wrong-word: the replaced word is never passed, and never called skipped", async () => {
  // The voice said "رب الناس"; the model wrote "ربياس", the other word run
  // into its neighbour. Something was said where ٱلْعَٰلَمِينَ belongs (the
  // piece holds more voice than "رب" takes), so "skipped" would be a false
  // verdict; what was said was not made out, so it is not heard clearly.
  const { verdict, flat } = await run("tts-fatiha-wrong-word");
  const w = verdict.alignment.words.find((x) => flat[x.refIndex].ayah === 2 && flat[x.refIndex].indexInAyah === 3);
  assert.ok(w && (w.status === "wrong" || w.status === "unclear"), `2:4 was ${w?.status}`);
  assert.equal(verdict.mistakes.filter((m) => m.kind === "skipped").length, 0);
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
  // The telephone band strips the "s" of بِسْمِ ("إِذْ مِ"): never a wrong word.
  assert.deepEqual(where("wrong"), []);
});

// ── Known limit: the model hears a real word that was not said ────────────

test("tts-fatiha: 1:6:2 heard as اسرق is judged wrong — a known limit of the model", async () => {
  // The plain Majed reading says ٱلصِّرَٰطَ; the model writes "اسرق", which is
  // a word of the Quran (سَرَقَ, 12:77). Nothing in the letters tells the
  // model's mistake from a reciter's, so it is accused. Locked here so a
  // change in it is seen; see WORKLOG.
  const { where } = await run("tts-fatiha");
  assert.deepEqual(where("wrong"), ["6:2"]);
  assert.deepEqual(where("missing"), []);
});

// ── A different word at a verse's edge (General Naadir's probe) ───────────
// The same voice reads each verse right and with one word changed; the model's
// real output of both is in the fixtures.

for (const [bad, ok, at, heard] of [
  ["tts-asr-haqq-ending", "tts-asr", "3:9", "بالحق"],
  ["tts-ikhlas-wahid", "tts-ikhlas", "2:2", "الوحد"],
] as const) {
  test(`${bad}: the changed word is wrong, with what was heard; read right, nothing is`, async () => {
    const b = await run(bad);
    const o = await run(ok);
    assert.equal(b.verdict.reliable, true);
    assert.deepEqual(b.where("wrong"), [at]);
    assert.deepEqual(b.where("missing"), []);
    assert.deepEqual(b.verdict.mistakes.map((m) => [m.kind, m.heard]), [["wrong", heard]]);
    assert.deepEqual(o.where("wrong"), []);
    assert.deepEqual(o.where("missing"), []);
    assert.deepEqual(o.verdict.mistakes, []);
    assert.ok(b.verdict.score < o.verdict.score, `bad ${b.verdict.score} vs right ${o.verdict.score}`);
  });
}

test("tts-baqarah-khasirun: 2:5 ending with الخاسرون is wrong at its last word, nothing else", async () => {
  const { verdict, where } = await run("tts-baqarah-khasirun");
  assert.equal(verdict.reliable, true);
  assert.deepEqual(where("wrong"), ["5:8"]);
  assert.deepEqual(where("missing"), []);
  assert.deepEqual(verdict.mistakes.map((m) => [m.kind, m.heard]), [["wrong", "الخسرون"]]);
});

test("a nearly-right word costs less than a wrong one, and the summary names it", async () => {
  const { verdict } = await run("tts-ikhlas");
  const close = verdict.alignment.words.filter((w) => w.status === "close");
  assert.ok(close.length > 0);
  for (const w of close) assert.ok(w.score >= CLOSE && w.score < CORRECT);
  assert.match(verdict.summary, /nearly right/);
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

test("letters that sound alike make a word nearly right at most, never right", () => {
  const sim = (a: string, b: string) => wordSim(spoken(a), spoken(b));
  // The recogniser's spelling or the learner's makhraj: nearly right.
  for (const [said, text] of [
    ["الرهمن", "ٱلرَّحْمَٰنِ"],
    ["الرهيم", "ٱلرَّحِيمِ"],
    ["السلوه", "ٱلصَّلَوٰةَ"],
    ["ينفكون", "يُنفِقُونَ"],
    ["رزكنهم", "رَزَقْنَٰهُمْ"],
    ["والزين", "وَٱلَّذِينَ"],
  ]) {
    assert.ok(sim(said, text) >= CLOSE && sim(said, text) < CORRECT, `${said} vs ${text}: ${sim(said, text)}`);
  }
  // The article before a sun letter is silent.
  assert.ok(sim("سمد", "ٱلصَّمَدُ") >= CLOSE);
  assert.ok(sim("سمت", "ٱلصَّمَدُ") >= CLOSE);
  // ...but "الله" is not "ال" + "له": it does not look like "قل هو" run together.
  assert.ok(sim("الله", "قلهو") < CLOSE, `${sim("الله", "قلهو")}`);
  // Before a moon letter the lām is heard, so a missing article still costs.
  assert.ok(sim("حمد", "ٱلْحَمْدُ") < CORRECT);
});

test("wrong means another word of the Quran was heard; letters that are no word are unclear", () => {
  const st = (heard: string, text: string) => statusOfPair(spoken(heard), spoken(text), wordSim(spoken(heard), spoken(text)));
  assert.equal(st("بالحق", "بِٱلصَّبْرِ"), "wrong"); // another word
  assert.equal(st("الواحد", "ٱلصَّمَدُ"), "wrong"); // alike only through the article
  assert.equal(st("التي", "ٱلَّذِى"), "wrong");
  assert.equal(st("ولغر", "وَلَا"), "unclear"); // a word cut in two by a pause
  assert.equal(st("العمسان", "ٱلْإِنسَٰنَ"), "close"); // the model's spelling
  assert.equal(st("لت", "لَيْلَةِ"), "unclear"); // a scrap of the word
  assert.equal(st("سمت", "ٱلصَّمَدُ"), "close");
  // The article after a particle: another word, not a slip...
  assert.equal(st("والقمر", "وَٱلشَّمْسِ"), "wrong");
  assert.equal(st("والعصر", "وَٱلْفَجْرِ"), "wrong");
  // ...but two letters after it are too few to tell from the model's spelling.
  assert.equal(st("والاد", "وَٱلْأَرْضِ"), "close");
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


// ── Cases found by the review (BOB and Heisenberg, 2026-10-25) ────────────

/** Pieces the way the model hands them over: `n` words per breath, with word
 *  times and a voice map, so the verdict can tell silence from unread voice. */
function breaths(ayat: Ayah[], n: number, skipVerse?: number, opts: { dropPiece?: number; source?: "model" | "browser" } = {}): PieceInput[] {
  const out: PieceInput[] = [];
  let t = 0;
  let id = 0;
  for (const a of ayat) {
    if (a.number === skipVerse) continue;
    const words = a.words.map((w) => w.uthmani);
    for (let i = 0; i < words.length; i += n) {
      const part = words.slice(i, i + n);
      const t0 = t;
      const t1 = t + part.length * 0.6;
      const myId = id++;
      t = t1 + 0.5;
      if (opts.dropPiece === myId) {
        out.push({ id: myId, t0, t1, text: "", failed: true, voiced: [[t0, t1]], source: "model" });
        continue;
      }
      if (opts.source === "browser") {
        out.push({ id: myId, t0, t1, text: part.join(" "), source: "browser" });
        continue;
      }
      out.push({
        id: myId,
        t0,
        t1,
        text: part.join(" "),
        words: part.map((w, k) => ({ text: w, start: t0 + k * 0.6, end: t0 + k * 0.6 + 0.55 })),
        voiced: [[t0, t1]],
        source: "model",
      });
    }
  }
  return out;
}
function judge(ayat: Ayah[], pieces: PieceInput[], from?: number) {
  const ref = buildRef(ayat);
  let s = createFollower(ref, undefined, from);
  for (const p of pieces) s = applyPiece(s, p);
  const flat = flattenAyat(ayat);
  const v = verdictOf(s, { words: flat.map((f) => f.word), engine: "test" });
  const at = (st: string) => v.alignment.words.filter((w) => w.status === st).map((w) => `${flat[w.refIndex].ayah}:${flat[w.refIndex].indexInAyah + 1}`);
  return { v, at, flat };
}

test("69:33 ends in بِٱللَّهِ ٱلْعَظِيمِ — that is the verse, not 'sadaqa Allahu l-azim'", async () => {
  const s = await loadSurah(69);
  const { at, v } = judge(s.ayat, breaths(s.ayat, 99));
  assert.deepEqual(at("missing"), []);
  assert.equal(v.reliable, true);
});

test("Ar-Rahman: skipping one refrain never marks the next, recited refrain as skipped", async () => {
  const s = await loadSurah(55);
  for (const skip of [13, 16, 18, 21, 40]) {
    const { at, flat } = judge(s.ayat, breaths(s.ayat, 99, skip));
    const recitedMissing = at("missing").filter((k) => Number(k.split(":")[0]) !== skip);
    assert.deepEqual(recitedMissing, [], `skip ${skip}`);
    void flat;
  }
});

test("2:68–2:70 share their opening: skipping 2:68 never accuses 2:69 (three-word breaths)", async () => {
  const s = await loadSurah(2);
  const ayat = s.ayat.slice(60, 75);
  for (const skip of [68, 69, 97]) {
    const set = skip === 97 ? s.ayat.slice(90, 105) : ayat;
    const { at } = judge(set, breaths(set, 3, skip));
    assert.deepEqual(at("missing").filter((k) => Number(k.split(":")[0]) !== skip), [], `skip ${skip}`);
  }
});

test("reciting a different surah than the one on screen gives no verdict", async () => {
  const shown = await loadSurah(67);
  const said = await loadSurah(78);
  const { v } = judge(shown.ayat, breaths(said.ayat, 6));
  assert.equal(v.reliable, false);
});

test("a piece the model failed to decode is unclear, never skipped", async () => {
  const s = await loadSurah(1);
  const { at } = judge(s.ayat, breaths(s.ayat, 99, undefined, { dropPiece: 3 }));
  assert.deepEqual(at("missing"), []);
  assert.deepEqual(at("unclear"), ["4:1", "4:2", "4:3"]);
});

test("a one-word verse the model wrote nothing for is unclear, never skipped (55:64)", async () => {
  const s = await loadSurah(55);
  const set = s.ayat.slice(59, 70); // 55:60–70, one piece per verse
  const empty = (voice: number) =>
    breaths(set, 99).map((p, i) => (i === 4 ? { ...p, text: "", words: [], voiced: [[p.t0, p.t0 + voice]] as [number, number][] } : p));
  const said = judge(set, empty(0.8));
  assert.deepEqual(said.at("missing"), []);
  assert.deepEqual(said.at("unclear"), ["64:1"]);
  // A click is not a word: the verse left out, a click in the usual pause
  // where it would have been, and the verse is skipped.
  const skipped = breaths(set, 99, 64);
  const before = skipped[3];
  const click: PieceInput = { id: 99, t0: before.t1 + 0.2, t1: before.t1 + 0.3, text: "", words: [], voiced: [[before.t1 + 0.2, before.t1 + 0.3]], source: "model" };
  assert.deepEqual(judge(set, [...skipped.slice(0, 4), click, ...skipped.slice(4)]).at("missing"), ["64:1"]);
  assert.deepEqual(judge(set, skipped).at("missing"), ["64:1"]);
  // A silence as long as the verse where it belongs, with nothing heard:
  // a soft voice the segmenter did not take may have said it.
  const hushed = empty(0.1).map((p, i) => (i === 4 ? { ...p, voiced: [] as [number, number][] } : p)).filter((_, i) => i !== 4);
  assert.deepEqual(judge(set, hushed).at("missing"), []);
});

test("words before the first piece heard are never skipped (backlog trimmed while the model loads)", async () => {
  for (const n of [1, 112, 67]) {
    const s = await loadSurah(n);
    const { at, v } = judge(s.ayat, breaths(s.ayat, 99).slice(2));
    assert.deepEqual(at("missing"), [], `surah ${n}`);
    assert.deepEqual(v.mistakes, [], `surah ${n}`);
  }
});

test("word-by-word reading never turns a said word into a skipped one", async () => {
  for (const n of [112, 101, 77, 109, 1]) {
    const s = await loadSurah(n);
    assert.deepEqual(judge(s.ayat, breaths(s.ayat, 1)).at("missing"), [], `surah ${n}`);
  }
  // Starting at verse 2 of Al-Ikhlas, one word at a time: the first "ٱللَّهُ"
  // is not carried back onto "قُلْ هُوَ", and nothing said is skipped.
  const s = await loadSurah(112);
  const { at } = judge(s.ayat, breaths(s.ayat.slice(1), 1));
  assert.deepEqual(at("missing"), []);
  assert.deepEqual(at("wrong"), []);
});

test("word by word with a verse left out: the follow keeps up, and only that verse is skipped", async () => {
  // A learner who pauses after every word gives one-word pieces; one word
  // alone may not move the place far, so the next word confirms it.
  for (const [n, upto, skip] of [
    [36, 60, 12],
    [36, 60, 14],
    [67, 30, 12],
    [2, 40, 10],
  ]) {
    const s = await loadSurah(n);
    const set = s.ayat.slice(0, upto);
    const { at, flat } = judge(set, breaths(set, 1, skip));
    const missing = at("missing");
    assert.deepEqual(missing.filter((k) => Number(k.split(":")[0]) !== skip), [], `${n} skip ${skip}`);
    assert.equal(missing.length, flat.filter((f) => f.ayah === skip).length, `${n} skip ${skip}: verse caught`);
  }
  // Ya-Sin, verses 12–16 each left out in turn: no word said is called skipped.
  const y = (await loadSurah(36)).ayat.slice(0, 60);
  for (const skip of [12, 13, 14, 15, 16]) {
    const { at } = judge(y, breaths(y, 1, skip));
    assert.deepEqual(at("missing").filter((k) => Number(k.split(":")[0]) !== skip), [], `skip ${skip}`);
  }
});

test("carrying on at the reciter's place needs a reciter who has begun", async () => {
  const s = await loadSurah(112);
  const ref = buildRef(s.ayat);
  const state = createFollower(ref, undefined, 4); // at verse 2, nothing heard yet
  const piece: PieceInput = { id: 1, t0: 5, t1: 7, text: "اله الوحد", source: "browser" };
  assert.equal(placeInput(state, piece, 4, true).align?.start, 4); // begun: verse 2, its word changed
  assert.notEqual(placeInput(state, piece, 4, false).align?.start, 4); // first piece: not forced there
});

/** One piece per verse, the way the model hands them over, but with word
 *  `drop` (verse:word) left out of what it wrote. `voiceKept`: the voice of
 *  the dropped word is still in the piece (the model lost it, Whisper spread
 *  its word times over the rest); otherwise the word was not said at all. */
function versePieces(ayat: Ayah[], drop: [number, number], voiceKept: boolean, heardAs: Record<string, string> = {}): PieceInput[] {
  const out: PieceInput[] = [];
  const len = (w: string) => 0.12 * spoken(w).length; // seconds: about a letter's worth each
  let t = 0;
  ayat.forEach((a, id) => {
    const isDrop = (i: number) => a.number === drop[0] && i === drop[1] - 1;
    const voiced = a.words.map((w) => w.uthmani).filter((_, i) => voiceKept || !isDrop(i));
    const t0 = t;
    const t1 = t + voiced.reduce((x, w) => x + len(w), 0);
    t = t1 + 0.5;
    const text = a.words
      .map((w, i) => (isDrop(i) ? null : heardAs[`${a.number}:${i + 1}`] ?? w.uthmani))
      .filter((w): w is string => w !== null);
    const step = (t1 - t0) / text.length;
    out.push({
      id,
      t0,
      t1,
      text: text.join(" "),
      words: text.map((w, k) => ({ text: w, start: t0 + k * step, end: t0 + (k + 1) * step })),
      voiced: [[t0, t1]],
      source: "model",
    });
  });
  return out;
}

test("a verse lost in a long silence is unclear; a verse left out in the usual pause is skipped", async () => {
  // Sudais under a classroom's murmur: the segmenter made no piece of verse 5,
  // and the silence where it belongs is as long as the verse.
  const s = await loadSurah(1);
  const lost = breaths(s.ayat, 99).filter((_, i) => i !== 4);
  assert.deepEqual(judge(s.ayat, lost).at("missing"), []);
  assert.deepEqual(judge(s.ayat, breaths(s.ayat, 99, 5)).at("missing"), ["5:1", "5:2", "5:3", "5:4"]);
});

test("a word the model lost from a piece is unclear when the piece holds its voice; skipped when it does not", async () => {
  const s = await loadSurah(1);
  // Whisper spreads the remaining words over the voice: no gap in time, but
  // the piece takes longer than its words at the reader's pace.
  const lost = judge(s.ayat, versePieces(s.ayat, [6, 2], true));
  assert.deepEqual(lost.at("missing"), []);
  assert.deepEqual(lost.at("unclear"), ["6:2"]);
  const skipped = judge(s.ayat, versePieces(s.ayat, [6, 2], false));
  assert.deepEqual(skipped.at("missing"), ["6:2"]);
});

test("a short word missing beside a word heard unclearly is unclear; beside clear words it is skipped", async () => {
  const s = await loadSurah(1);
  // ٱلْمَغْضُوبِ heard as "منضوب": غَيْرِ may be inside it.
  const blurred = judge(s.ayat, versePieces(s.ayat, [7, 5], false, { "7:6": "منضوب" }));
  assert.deepEqual(blurred.at("missing"), []);
  const clear = judge(s.ayat, versePieces(s.ayat, [7, 5], false));
  assert.deepEqual(clear.at("missing"), ["7:5"]);
  // A long word cannot hide in a garbled neighbour: ٱلصِّرَٰطَ left out beside
  // ٱهْدِنَا heard as "احدنا" is skipped.
  const long = judge(s.ayat, versePieces(s.ayat, [6, 2], false, { "6:1": "احدنا" }));
  assert.deepEqual(long.at("missing"), ["6:2"]);
});

test("a word of two letters missing inside a piece is unclear: it joins the next in speech", async () => {
  const s = await loadSurah(2);
  const set = s.ayat.slice(0, 5);
  const la = judge(set, versePieces(set, [2, 3], false)); // لَا in ذَٰلِكَ ٱلْكِتَٰبُ لَا رَيْبَ
  assert.deepEqual(la.at("missing"), []);
  const rayb = judge(set, versePieces(set, [2, 4], false)); // رَيْبَ: a word of its own
  assert.deepEqual(rayb.at("missing"), ["2:4"]);
});

test("a stray word next to a gap is never what was said instead, when the gap was not clean", async () => {
  const s = await loadSurah(2);
  const set = s.ayat.slice(0, 6);
  const stray = (p: PieceInput): PieceInput => ({
    ...p,
    text: `${p.text} فكتب`,
    words: p.words ? [...p.words, { text: "فكتب", start: p.t1 - 0.3, end: p.t1 }] : undefined,
  });
  // The model could not decode verse 4 (voice we could not read).
  const failed = breaths(set, 99, undefined, { dropPiece: 3 }).map((p, i) => (i === 2 ? stray(p) : p));
  assert.deepEqual(judge(set, failed).v.mistakes, []);
  // The browser's recogniser dropped verse 4 at a restart: no word times to go on.
  const browser = breaths(set, 99, undefined, { source: "browser" }).map((p, i) => (i === 2 ? stray(p) : p));
  browser.splice(3, 1);
  assert.deepEqual(judge(set, browser).v.mistakes, []);
  // A one-word verse (55:64) the model could not decode, and a stray word of
  // the Quran at the end of the verse before: the stray word is not taken for it.
  const r = (await loadSurah(55)).ayat.slice(59, 70);
  const word = (p: PieceInput): PieceInput => ({
    ...p,
    text: `${p.text} الجبال`,
    words: p.words ? [...p.words, { text: "الجبال", start: p.t1 - 0.3, end: p.t1 }] : undefined,
  });
  const lost = breaths(r, 99, undefined, { dropPiece: 4 }).map((p, i) => (i === 3 ? word(p) : p));
  assert.deepEqual(judge(r, lost).v.mistakes, []);
  const lostBrowser = breaths(r, 99, undefined, { source: "browser" }).map((p, i) => (i === 3 ? word(p) : p));
  lostBrowser.splice(4, 1);
  assert.deepEqual(judge(r, lostBrowser).v.mistakes, []);
  // Verse 4 heard only as noise (a piece we could not place), stray word after it.
  const noise = breaths(set, 99).map((p, i) =>
    i === 3 ? { ...p, text: "ق", words: [{ text: "ق", start: p.t0, end: p.t0 + 0.3 }] } : i === 4 ? { ...p, text: `فكتب ${p.text}`, words: [{ text: "فكتب", start: p.t0, end: p.t0 + 0.3 }, ...(p.words ?? [])] } : p,
  );
  assert.deepEqual(judge(set, noise).v.mistakes.filter((m) => m.kind === "wrong"), []);
});

test("with the browser as judge, a dropped phrase or word is unclear, never skipped", async () => {
  const s = await loadSurah(112);
  const pieces = breaths(s.ayat, 99, undefined, { source: "browser" });
  pieces.splice(1, 1); // the recogniser dropped verse 2's result
  pieces[1] = { ...pieces[1], text: "لم يلد ولم" }; // and a word inside verse 3
  const { at } = judge(s.ayat, pieces);
  assert.deepEqual(at("missing"), []);
});

test("reciting from verse 61 of Al-Baqarah anchors there, not on an earlier copy of the phrase", async () => {
  const s = await loadSurah(2);
  const ref = buildRef(s.ayat);
  for (const v of [61, 69, 70, 71]) {
    const part = s.ayat.slice(v - 1, v + 2);
    const pieces = breaths(part, 4);
    const ayatAll = s.ayat;
    let st = createFollower(ref, undefined, ref.verseFirst.get(v));
    for (const p of pieces) st = applyPiece(st, p);
    const flat = flattenAyat(ayatAll);
    const verdict = verdictOf(st, { words: flat.map((f) => f.word), engine: "test" });
    const missing = verdict.alignment.words.filter((w) => w.status === "missing");
    assert.equal(missing.length, 0, `from ${v}: ${missing.length} false skips`);
    assert.equal(flat[verdict.alignment.words[0].refIndex].ayah, v);
  }
});

test("said wrong, then right on a second reading: corrected, and a substitution is 'wrong', not skip + added", () => {
  const ayat = ayatOf(["قل هو الله احد", "الله الصمد"]);
  let s = createFollower(buildRef(ayat));
  s = applyPiece(s, piece(0, "قل هو كتاب احد"));
  const first = s.pieces[0].align!;
  assert.deepEqual(first.skipped, []);
  assert.deepEqual(first.extras, []);
  s = applyPiece(s, piece(1, "قل هو الله احد الله الصمد"));
  const v = verdictOf(s, { words: flattenAyat(ayat).map((f) => f.word), engine: "test" });
  assert.ok(v.mistakes.some((m) => m.refIndex === 2 && m.kind === "corrected"));
});
