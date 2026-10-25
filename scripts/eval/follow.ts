// Print what Dugsi would say for every recorded fixture.
// Usage: npx tsx scripts/eval/follow.ts [name ...]
import { readdirSync, readFileSync } from "node:fs";
import { loadSurah } from "../../lib/quran";
import { flattenAyat } from "../../lib/quran/types";
import { runFixture, type Fixture } from "../../lib/follow/fixture";

async function main() {
  const dir = "test/fixtures/recite";
  const want = process.argv.slice(2);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const fx = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Fixture;
    if (want.length && !want.includes(fx.name)) continue;
    const surah = await loadSurah(fx.surah);
    const flat = flattenAyat(surah.ayat);
    const { state, verdict } = runFixture(fx, surah.ayat);
    const by = (st: string) => verdict.alignment.words.filter((w) => w.status === st);
    const fmt = (st: string) => by(st).map((w) => `${flat[w.refIndex].ayah}:${flat[w.refIndex].indexInAyah + 1}`).join(" ");
    console.log(`\n${fx.name} — ${fx.note}`);
    console.log(`  reliable=${verdict.reliable} score=${verdict.score} span=${verdict.alignment.words.length} cursor=${state.cursor}/${state.end} pieces=${state.pieces.map((p) => p.kind[0]).join("")}`);
    console.log(`  wrong: ${fmt("wrong") || "-"} | skipped: ${fmt("missing") || "-"} | unclear: ${fmt("unclear") || "-"} | close: ${by("close").length} | extras: ${verdict.extras.join(" ") || "-"}`);
    if (verdict.jumps.length) console.log(`  jumps: ${verdict.jumps.map((j) => `${j.fromVerse}->${j.toVerse}`).join(" ")}`);
    console.log(`  ${verdict.summary}`);
  }
}
void main();
