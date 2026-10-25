// FÖRE-bevis: the old live tracker (lib/live.ts trackLive) on a recitation where
// one verse is not picked up by the recogniser and the reciter carries on.
import { readFileSync } from "node:fs";
import { trackLive } from "../../lib/live";
import { normalizeWord, tokenize } from "../../lib/arabic";

const raw = JSON.parse(readFileSync("lib/quran/data/2.json", "utf8"));
const verses: { n: number; text: string }[] = raw.verses.slice(0, 10);
const expectedWords = verses.flatMap((v) => v.text.split(/\s+/).filter(Boolean));
const expected = expectedWords.map(normalizeWord);
const verseOf: number[] = verses.flatMap((v) => v.text.split(/\s+/).filter(Boolean).map(() => v.n));

// Reciter says 2:1–2:10; the recogniser catches nothing usable of 2:4 (noise words).
const said: string[] = [];
for (const v of verses) {
  if (v.n === 4) said.push("و", "اه", "ممم", "يا", "نن", "سس", "اا", "ههه", "لا", "م", "ب", "ت", "ث", "ح", "خ");
  else said.push(...tokenize(v.text));
}
// Feed it like Reciter.tsx does: incremental token batches.
let pointer = 0;
const marked = new Set<number>();
for (let i = 0; i < said.length; i += 3) {
  const r = trackLive(expected, said.slice(i, i + 3), pointer, { mistakes: true });
  pointer = Math.max(pointer, r.pointer);
  for (const k in r.statuses) if (r.statuses[k] === "correct" || r.statuses[k] === "close") marked.add(Number(k));
}
const after = expected.map((_, i) => i).filter((i) => verseOf[i] >= 5);
const caught = after.filter((i) => marked.has(i)).length;
console.log(`expected words: ${expected.length}, verses 5-10 words: ${after.length}`);
console.log(`old tracker: pointer ended at word ${pointer} (verse ${verseOf[Math.min(pointer, expected.length - 1)]}), should be ${expected.length}`);
console.log(`old tracker: words of verses 5-10 marked as heard: ${caught}/${after.length}`);
