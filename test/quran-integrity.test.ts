import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fatiha } from "../lib/quran/fatiha";
import { normalizeWord } from "../lib/arabic";

// Independent canonical reference for Surah Al-Fatiha (Uthmani script), written
// out as whole ayat rather than per-word. Comparing our per-word data against
// this catches any typo, missing word, or wrong split. Source text follows the
// standard Tanzil/Mushaf Uthmani rendering.
const CANONICAL: string[] = [
  "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
  "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ",
  "ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
  "مَٰلِكِ يَوْمِ ٱلدِّينِ",
  "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
  "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ",
  "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ",
];

// Pinned checksum of the exact diacritic text in fatiha.ts. Any change to a
// single mark flips this hash, so the religious text can never drift silently.
// If a change is intentional and reviewed, update this value.
const PINNED_SHA256 = "557e8ef1fe49090221c1dc09304dff792d378ba1b551250fb4fd9a21034a8be4";

test("Al-Fatiha matches the canonical text (consonantal skeleton, word by word)", () => {
  assert.equal(fatiha.ayat.length, CANONICAL.length, "wrong number of ayat");
  for (let i = 0; i < CANONICAL.length; i++) {
    const ours = fatiha.ayat[i].words.map((w) => normalizeWord(w.uthmani)).join(" ");
    const ref = CANONICAL[i].split(/\s+/).map(normalizeWord).filter(Boolean).join(" ");
    assert.equal(ours, ref, `ayah ${i + 1} does not match the canonical text`);
  }
});

test("Al-Fatiha text is locked by checksum (guards against silent edits)", () => {
  const joined = fatiha.ayat
    .map((a) => a.words.map((w) => w.uthmani).join(" "))
    .join("\n")
    .normalize("NFC");
  const hash = crypto.createHash("sha256").update(joined).digest("hex");
  assert.equal(
    hash,
    PINNED_SHA256,
    `Al-Fatiha text checksum changed (now ${hash}). If this edit is intentional and reviewed, update PINNED_SHA256.`,
  );
});
