// What Tarteel's Quran model wrote for deliberate vowel mistakes (macOS Majed
// reading Al-Fatiha and 2:4 with one vowel changed) and for right readings.
// The model writes the vowel it hears; Dugsi compares it with the text's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { vowelSlip } from "../lib/follow/harakat";

const slip = (heard: string, text: string, paused = false) => {
  const s = vowelSlip(heard, text, paused);
  return s ? `${s.want}->${s.heard}${s.ending ? " end" : ""}` : null;
};

test("a vowel said wrong and written by the model is found", () => {
  assert.equal(slip("الْحَمْدَ", "ٱلۡحَمۡدُ"), "u->a end"); // al-ḥamda
  assert.equal(slip("الْحَمْدِ", "ٱلۡحَمۡدُ"), "u->i end");
  assert.equal(slip("رَبُ", "رَبِّ"), "i->u end"); // rabbu
  assert.equal(slip("لُلَهِ", "لِلَّهِ"), "i->u"); // lullāhi
  assert.equal(slip("مَالِكُ", "مَٰلِكِ"), "i->u end");
  assert.equal(slip("نَعْبَدُ", "نَعۡبُدُ"), "u->a");
  assert.equal(slip("أَنْعَمْتُ", "أَنۡعَمۡتَ"), "a->u end");
  assert.equal(slip("عَلَيْهُمْ", "عَلَيۡهِمۡ"), "i->u");
  assert.equal(slip("إِلُوَّكَ", "إِلَيۡكَ"), "a->u"); // the y heard as w after the wrong vowel
  assert.equal(slip("أَنْزَلَ", "أُنزِلَ"), "u->a");
});

test("right readings are not accused: shadda dropped, long vowels spelled otherwise", () => {
  assert.equal(slip("لِلَهِ", "لِلَّهِ"), null); // shadda left out
  assert.equal(slip("رَبِ", "رَبِّ"), null);
  assert.equal(slip("الْعَالَمِينَ", "ٱلۡعَٰلَمِينَ"), null);
  assert.equal(slip("الْعَلَمِينَ", "ٱلۡعَٰلَمِينَ"), null); // alif left out
  assert.equal(slip("إِيَّكَ", "إِيَّاكَ"), null);
  assert.equal(slip("مَالِكِ", "مَٰلِكِ"), null);
});

test("nothing is judged where the model is not to be trusted", () => {
  // The ending of a word the reciter stopped on is not voiced (waqf).
  assert.equal(slip("نَسْتَعِينِ", "نَسۡتَعِينُ", true), null);
  assert.equal(slip("الْحَمْدَ", "ٱلۡحَمۡدُ", true), null);
  // Before a long vowel the short vowel is the long one's: Sudais's
  // "اهْدِنُوا" for ٱهۡدِنَا is the model's, not his.
  assert.equal(slip("اهْدِنُوا", "ٱهۡدِنَا"), null);
  // Other letters: a matter for the letter comparison, not the vowels.
  assert.equal(slip("الْكِتْوَ", "ٱلۡكِتَٰبِ"), null);
  // A mark the model left out, or sukun, is never a mistake.
  assert.equal(slip("الحمد", "ٱلۡحَمۡدُ"), null);
});
