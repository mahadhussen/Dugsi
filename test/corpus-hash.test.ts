import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Whole-corpus drift guard. The Quran text is the one thing in this app that
// must never change silently: a single altered mark is the worst harm the app
// could do. This hashes every shipped surah text (2..114; surah 1 is guarded
// separately in quran-integrity.test.ts) and pins the result. Any change to any
// character flips the hash and fails CI.
//
// NOTE (open item from the review): this guards against DRIFT, not against the
// text being wrong to begin with. A one-time character-level verification of the
// full corpus against the Tanzil source by a qualified person is still required,
// and the source is documented as tanzil.net (Uthmani/Hafs, Madani mushaf).
const PINNED_SHA256 = "f6b27922c976f0cb40dc90fc6cda3a823f51af46bb5872f633ae6734d5c16889";

function corpusHash(): { hash: string; count: number } {
  const dir = path.join(__dirname, "..", "lib", "quran", "data");
  const parts: string[] = [];
  let count = 0;
  for (let id = 2; id <= 114; id++) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8"));
    const text = raw.verses.map((v: { text: string }) => String(v.text)).join("\n");
    parts.push(`${id}\n${text}`);
    count++;
  }
  const joined = parts.join("\n---\n").normalize("NFC");
  return { hash: crypto.createHash("sha256").update(joined).digest("hex"), count };
}

test("all 113 generated surah files are present (2..114)", () => {
  const { count } = corpusHash();
  assert.equal(count, 113, "expected surahs 2..114");
});

test("full Quran corpus is locked by checksum (no silent text drift)", () => {
  const { hash } = corpusHash();
  assert.equal(
    hash,
    PINNED_SHA256,
    "Quran corpus text changed. If this was intentional and reviewed by a qualified person, update PINNED_SHA256.",
  );
});
