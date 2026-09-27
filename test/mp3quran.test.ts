import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSurahUrl,
  findReciter,
  normalizeArabic,
  normalizeServer,
  pickMoshaf,
  readCatalogue,
} from "../lib/mp3quran";
import { RECITERS, ayahAudioUrl, getReciter, hasPerAyahAudio, perAyahReciterId } from "../lib/audio-quran";

// A trimmed copy of the shape mp3quran.net's catalogue returns: a few reciters,
// each with one or more mus'hafs.
const CATALOGUE = {
  reciters: [
    { id: 1, name: "إبراهيم الأخضر", moshaf: [{ name: "حفص عن عاصم - مرتل", server: "https://server8.mp3quran.net/akdr/", surah_total: 114, surah_list: "1,2,3" }] },
    {
      id: 42,
      name: "الزين محمد احمد",
      moshaf: [
        { name: "المصحف المعلم", server: "", surah_total: 5 },
        { name: "حفص عن عاصم - مرتل", server: "http://server10.mp3quran.net/zain", surah_total: 114, surah_list: "1,2,3,112,113,114" },
        { name: "شعبة عن عاصم - مرتل", server: "https://server10.mp3quran.net/zain_shuba/", surah_total: 114 },
      ],
    },
  ],
};

test("the catalogue is read whether it is wrapped or a bare list", () => {
  assert.equal(readCatalogue(CATALOGUE).length, 2);
  assert.equal(readCatalogue(CATALOGUE.reciters).length, 2);
  // Anything unexpected is simply empty, never a crash.
  assert.deepEqual(readCatalogue(null), []);
  assert.deepEqual(readCatalogue({ oops: 1 }), []);
});

test("Arabic spelling differences do not hide a reciter", () => {
  // Harakat, hamza on the alef, tatweel and doubled spaces all fall away.
  assert.equal(normalizeArabic("الزَّيْن مُحَمَّد أَحْمَد"), normalizeArabic("الزين محمد احمد"));
  assert.equal(normalizeArabic("الزيـــن  محمد   أحمد"), "الزين محمد احمد");

  // So the Sheikh is found from the spelling Dugsi stores, hamza and all.
  const found = findReciter(readCatalogue(CATALOGUE), "الزين محمد أحمد");
  assert.equal(found?.id, 42);
  // And an id, when we have one, wins over the name.
  assert.equal(findReciter(readCatalogue(CATALOGUE), "لا أحد", 1)?.id, 1);
  assert.equal(findReciter(readCatalogue(CATALOGUE), "شيخ غير موجود"), null);
});

test("the Hafs murattal recording is the one chosen, and never a serverless one", () => {
  const moshaf = pickMoshaf(findReciter(readCatalogue(CATALOGUE), "الزين محمد أحمد")!);
  assert.ok(moshaf, "a mus'haf was picked");
  // Shu'ba is the same reciter in another riwaya — Dugsi shows Hafs, so Hafs it is.
  assert.equal(moshaf!.server, "https://server10.mp3quran.net/zain/");
  assert.deepEqual(moshaf!.surahs, [1, 2, 3, 112, 113, 114]);

  // No server at all means no recording we can play.
  assert.equal(pickMoshaf({ id: 9, name: "x", moshaf: [{ name: "حفص", server: "" }] }), null);
  assert.equal(pickMoshaf({ id: 9, name: "x" }), null);
  // A missing surah list means "we don't know", not "none".
  assert.equal(pickMoshaf({ name: "حفص عن عاصم - مرتل", moshaf: [{ server: "https://s/x/" }] } as never)?.surahs ?? null, null);
});

test("an address from the catalogue is made safe to load from Dugsi", () => {
  // Dugsi is served over https, so an http server would be blocked entirely.
  assert.equal(normalizeServer("http://server10.mp3quran.net/zain"), "https://server10.mp3quran.net/zain/");
  assert.equal(normalizeServer("https://s/x/"), "https://s/x/");
  // Surah files are three digits, so 1 and 114 both resolve.
  assert.equal(buildSurahUrl("https://s/x/", 1), "https://s/x/001.mp3");
  assert.equal(buildSurahUrl("https://s/x", 114), "https://s/x/114.mp3");
  assert.equal(buildSurahUrl("https://s/x/", 36), "https://s/x/036.mp3");
});

test("Sheikh Al Zain is in the library, as a whole-surah voice", () => {
  const zain = RECITERS.find((r) => r.id === "alzain");
  assert.ok(zain, "Al Zain Mohammad Ahmad is offered");
  assert.equal(zain!.source, "mp3quran");
  assert.equal(zain!.country, "Sudan");
  assert.ok(zain!.mp3quran?.arabicName, "we know which name to look up");
  assert.equal(hasPerAyahAudio(zain!), false);
  // Every other reciter still has a file per ayah.
  for (const r of RECITERS) {
    if (r.id === "alzain") continue;
    assert.ok(hasPerAyahAudio(r), `${r.id} has per-ayah audio`);
  }
});

test("one verse on its own still has a voice for a whole-surah Sheikh", () => {
  // There are no ayah boundaries inside a surah recording, so a tapped verse
  // falls back to the default voice instead of failing silently.
  assert.equal(perAyahReciterId("alzain"), "alafasy");
  assert.equal(perAyahReciterId("husary"), "husary");
  const url = ayahAudioUrl(112, 1, "alzain");
  assert.ok(url.includes(getReciter("alafasy").folder!), url);
  assert.ok(url.endsWith("/112001.mp3"), url);
});
