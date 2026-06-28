import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import data from "../lib/quran/data/2.json";
import { tokenize } from "../lib/arabic";

// Al-Baqarah is sourced from a verified dataset (quran-json, Uthmani script),
// not typed by hand. These checks lock the bundled text: a pinned checksum
// guards against any silent change, and spot-checks of well-known verses
// confirm it is genuinely Al-Baqarah and split correctly.

const PINNED_SHA256 = "79659967be4b4a9dedce7abc0c7f19e089747a671e92b385e8223021329c9de2";

const verse = (n: number) => data.verses[n - 1];
const norm = (s: string) => tokenize(s).join(" ");

test("Al-Baqarah has all 286 verses", () => {
  assert.equal(data.id, 2);
  assert.equal(data.verses.length, 286);
  assert.equal(data.ayahCount, 286);
});

test("Al-Baqarah text is locked by checksum", () => {
  const joined = data.verses
    .map((v: { text: string }) => v.text)
    .join("\n")
    .normalize("NFC");
  const hash = crypto.createHash("sha256").update(joined).digest("hex");
  assert.equal(
    hash,
    PINNED_SHA256,
    `Al-Baqarah text checksum changed (now ${hash}). If intentional and reviewed, update PINNED_SHA256.`,
  );
});

test("Al-Baqarah well-known verses match", () => {
  // 2:1 — Alif Lam Mim
  assert.equal(norm(verse(1).text), "الم");
  // 2:255 — Ayat al-Kursi
  assert.ok(norm(verse(255).text).startsWith("الله لا اله الا هو الحي"), "Ayat al-Kursi");
  // 2:285 — Āmana r-Rasūl
  assert.ok(norm(verse(285).text).startsWith("ءامن الرسول"), "2:285");
  // 2:286 — ends with "...the disbelieving people"
  assert.ok(norm(verse(286).text).endsWith("القوم الكفرين"), "2:286 ending");
});
