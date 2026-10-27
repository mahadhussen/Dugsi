// Deliberate vowel mistakes, read by macOS's Arabic voice (Majed): per verse
// one clip with a wrong vowel inside a word and one with a wrong ending (never
// the verse's last word, where a reciter stops and the ending is silent).
// Writes .eval/audio/vowel/<name>.wav and manifest.json for scripts/eval/vowels.ts.
//   npx tsx scripts/eval/make-vowel-corpus.ts
// macOS only (say). A hamza letter's vowel is left alone: the voice reads its
// letter (إ is i) whatever mark it carries, so the mistake would not be said.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadCtcText } from "../../lib/quran/ctc-text";
import { vowelSlots } from "../../lib/follow/vowel-judge";

const OUT = ".eval/audio/vowel";
const VERSES: [number, number[]][] = [
  [1, [2, 3, 4, 5, 6, 7]],
  [112, [1, 2, 3, 4]],
  [113, [1, 2, 3, 4, 5]],
  [114, [1, 2, 3, 4, 5, 6]],
  [103, [1, 2, 3]],
  [108, [1, 2, 3]],
  [2, [2, 3, 4, 5]],
];
const NEXT = { a: "u", u: "i", i: "a" } as const;
const MARK = { a: "َ", u: "ُ", i: "ِ" } as const;
const HAMZA = new Set(["أ", "إ", "آ", "ء", "ؤ", "ئ", "ٱ"]);

// A fixed pseudo-random pick, so the corpus is the same every time.
let seed = 7;
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest: Record<string, { verse: number; word: number; heard: string }[]> = {};
  const jobs: string[] = [];
  for (const [surah, verses] of VERSES) {
    const ctc = await loadCtcText(surah);
    for (const v of verses) {
      const words = ctc[v - 1];
      for (const kind of ["in", "end"] as const) {
        const cands: { w: number; part: number; idx: number; vowel: "a" | "u" | "i" }[] = [];
        words.forEach((uw, w) => {
          if (w === words.length - 1) return; // the verse's last word: a pause
          uw.split(" ").forEach((mw, part, parts) => {
            for (const s of vowelSlots(mw, false)) {
              const base = [...mw.slice(0, s.idx)].filter((c) => !/\p{Mn}/u.test(c) && c !== "ـ").at(-1) ?? "";
              if (HAMZA.has(base)) continue;
              if (kind === "end" ? s.ending && part === parts.length - 1 : !s.ending && s.base > 0)
                cands.push({ w, part, idx: s.idx, vowel: s.vowel });
            }
          });
        });
        if (!cands.length) continue;
        const c = cands[rnd(cands.length)];
        const heard = NEXT[c.vowel];
        const said = words.map((uw, w) =>
          w !== c.w
            ? uw
            : uw
                .split(" ")
                .map((mw, part) => (part === c.part ? mw.slice(0, c.idx) + MARK[heard] + mw.slice(c.idx + 1) : mw))
                .join(" "),
        );
        const name = `s${surah}v${v}-${kind}`;
        execFileSync("say", ["-v", "Majed", "-r", "150", "-o", `${OUT}/${name}.aiff`, said.join(" ")]);
        execFileSync("/opt/homebrew/bin/ffmpeg", ["-loglevel", "error", "-y", "-i", `${OUT}/${name}.aiff`, "-af", "adelay=400,apad=pad_dur=0.6", "-ac", "1", "-ar", "16000", `${OUT}/${name}.wav`]);
        manifest[`${name}.wav`] = [{ verse: v, word: c.w, heard }];
        jobs.push(`${OUT}/${name}.wav:${surah}:${v}`);
        console.log(name, said[c.w], `(${c.vowel}→${heard})`);
      }
    }
  }
  writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
  writeFileSync(`${OUT}/jobs.txt`, jobs.join("\n") + "\n");
  console.log(jobs.length, "clips");
}
void main();
