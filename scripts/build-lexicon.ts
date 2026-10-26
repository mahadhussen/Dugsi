// Writes lib/follow/lexicon-data.json: the spelling key of every word of the
// Quran, in Uthmani and in modern spelling. Run after the text changes:
//   npx tsx scripts/build-lexicon.ts
// test/lexicon.test.ts fails when the file no longer matches the text.
import { writeFileSync } from "node:fs";
import { quranSpellingKeys } from "../lib/follow/lexicon-build";

async function main() {
  const forms = await quranSpellingKeys();
  writeFileSync("lib/follow/lexicon-data.json", JSON.stringify(forms) + "\n");
  console.log(`${forms.length} spelling keys`);
}
void main();
