import { test } from "node:test";
import assert from "node:assert/strict";
import { wordRules, wordMadd } from "../lib/tajweed/engine";

test("detects the name Allah as lām al-jalālah", () => {
  assert.ok(wordRules("ٱللَّهُ").includes("lam_jalalah"));
  assert.ok(wordRules("لِلَّهِ").includes("lam_jalalah"));
  assert.ok(wordRules("وَٱللَّهُ").includes("lam_jalalah"));
  // and it is NOT mistaken for the sun/moon article
  const r = wordRules("ٱللَّهُ");
  assert.ok(!r.includes("sun_letter") && !r.includes("moon_letter"));
});

test("classifies the al- article as sun vs moon letter", () => {
  // ٱلرَّحْمَٰن — rā is a sun letter
  assert.ok(wordRules("ٱلرَّحْمَٰنِ").includes("sun_letter"));
  // ٱلْحَمْد — ḥā is a moon letter
  assert.ok(wordRules("ٱلْحَمْدُ").includes("moon_letter"));
  // article after a prefix (wa-): وَٱلْعَصْر
  assert.ok(wordRules("وَٱلْعَصْرِ").includes("moon_letter"));
});

test("detects ghunnah on a doubled noon/meem", () => {
  assert.ok(wordRules("ٱلنَّاسِ").includes("ghunnah")); // an-nās
  assert.ok(wordRules("ثُمَّ").includes("ghunnah")); // thumma
});

test("detects qalqalah on ق ط ب ج د with sukūn", () => {
  assert.ok(wordRules("صِدۡقٍ").includes("qalqalah")); // dāl sākin
  assert.ok(wordRules("تَجۡرِي").includes("qalqalah")); // jīm sākin
});

test("detects leen (soft wāw/yāʾ after fatḥa)", () => {
  assert.ok(wordRules("يَوۡمِ").includes("leen")); // yawm
  assert.ok(wordRules("عَلَيۡهِمۡ").includes("leen")); // ʿalayhim
});

test("does not mark a madd yāʾ/wāw as leen", () => {
  // نَسۡتَعِينُ — the ī is a madd (kasra + yāʾ), not leen
  assert.ok(!wordRules("نَسۡتَعِينُ").includes("leen"));
});

test("detects madd lāzim (maddah followed by shadda)", () => {
  // aḍ-ḍāāāllīn, with the maddah encoded as alef + combining maddah (U+0653)
  const r = wordRules("ٱلضَّآلِّينَ");
  assert.ok(r.includes("madd_lazim"));
  assert.equal(wordMadd(r), "lazim");
  // precomposed آ (U+0622) must work too
  assert.ok(wordRules("دَآبَّةٖ").includes("madd_lazim"));
});

test("falls back to shaddah for an ordinary doubled consonant", () => {
  assert.ok(wordRules("رَبِّ").includes("shaddah"));
});

test("a plain word with no distinctive rule returns nothing", () => {
  assert.deepEqual(wordRules("نَعۡبُدُ"), []);
});
