// The vowel judge on real audio, exactly as the app runs it: the pinned 4-bit
// vowel model through transformers.js, then lib/follow/vowel-judge.ts.
//
// Setup (local only, .eval/ is ignored by git):
//   npm i --prefix .eval/tjs @huggingface/transformers@3.3.3
//   download the files of VOWEL_MODEL (lib/listen/vowel-model.ts) at its
//   revision into .eval/models/<id>/ (onnx/model_q4.onnx + the json files)
// Run:
//   npx tsx scripts/eval/vowels.ts [--manifest m.json] [--json out.json] file:surah[:from[-to]] ...
// Any audio ffmpeg reads. Each file is judged against the verses given (all
// of the surah by default), isti'adha and basmala included: words not said
// are left out by the judge itself (heard context).
//
// A manifest lists the mistakes each file holds, to count caught and false:
//   { "file.wav": [{ "verse": 2, "word": 0, "heard": "a" }] }  (word: index in the verse)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { logSoftmax } from "../../lib/follow/ctc";
import { heardPairs, heardWords, judgeVowels, vowelMargins, VOWEL_MARGIN } from "../../lib/follow/vowel-judge";
import { VOWEL_MODEL } from "../../lib/listen/vowel-model";
import { VOWEL_VOCAB } from "../../lib/listen/vowel-pass";
import { loadCtcText } from "../../lib/quran/ctc-text";

const ROOT = resolve(__dirname, "../..");
const ISTIADHA = "أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ".split(" ");
const BASMALA = "بِسْمِ اللَّهِ الرَّحْمَـٰنِ الرَّحِيمِ".split(" ");

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

function pcm(file: string): Float32Array {
  const ff = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
  const buf = execFileSync(ff, ["-loglevel", "error", "-i", file, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

interface Word {
  text: string;
  verse: number; // 0: isti'adha or basmala said before the surah
  inVerse: number;
}

async function textOf(surah: number, from: number, to: number): Promise<Word[]> {
  const ctc = await loadCtcText(surah);
  const out: Word[] = [...ISTIADHA, ...(surah === 1 || surah === 9 ? [] : BASMALA)].map((text, i) => ({ text, verse: 0, inVerse: i }));
  for (let v = from; v <= to; v++)
    ctc[v - 1].forEach((w, i) => w.split(" ").filter(Boolean).forEach((text) => out.push({ text, verse: v, inVerse: i })));
  return out;
}

async function main() {
  const tjs = join(ROOT, ".eval/tjs");
  const T = createRequire(join(tjs, "package.json"))("@huggingface/transformers");
  T.env.allowRemoteModels = false;
  T.env.localModelPath = join(ROOT, ".eval/models/");
  const model = await T.AutoModelForCTC.from_pretrained(VOWEL_MODEL.id, { dtype: VOWEL_MODEL.dtype });
  const proc = await T.AutoProcessor.from_pretrained(VOWEL_MODEL.id);
  const manifest = flag("manifest") ? JSON.parse(readFileSync(flag("manifest")!, "utf8")) : {};
  const jobs = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
  const report: unknown[] = [];
  let caught = 0;
  let missed = 0;
  let falseAlarms = 0;
  let judgedWords = 0;
  for (const job of jobs) {
    const [file, surahS, range] = job.split(":");
    const surah = Number(surahS);
    const verses = (await loadCtcText(surah)).length;
    const [from, to] = range ? range.split("-").map(Number) : [1, verses];
    const words = await textOf(surah, from, to ?? from);
    const audio = pcm(file);
    const t = performance.now();
    const out = await model(await proc(audio));
    const ms = performance.now() - t;
    const [, frames, V] = out.logits.dims;
    const lp = logSoftmax(out.logits.data as Float32Array, frames, V);
    const heard = heardWords(lp, VOWEL_VOCAB);
    // As the app: a verse's last word (and the formulas' last) ends at a stop.
    const verseEnds = new Set(words.map((w, i) => i).filter((i) => i === words.length - 1 || words[i + 1].verse !== words[i].verse || (words[i].verse === 0 && i === ISTIADHA.length - 1)));
    const found = judgeVowels(lp, words.map((w) => w.text), VOWEL_VOCAB, { verseEnds });
    // Every judged vowel's best margin, to see how close the right ones come.
    const pairs = heardPairs(heard, words.map((w) => w.text));
    const target = heard.map((h, i) => (pairs.has(i) ? words[pairs.get(i)!].text : h));
    const stops = new Set([...pairs].filter(([, j]) => verseEnds.has(j)).map(([i]) => i));
    const margins = vowelMargins(lp, target, VOWEL_VOCAB, new Set(pairs.keys()), stops);
    judgedWords += new Set(margins.map((m) => m.word)).size;
    const want: { verse: number; word: number; heard: string }[] = manifest[basename(file)] ?? [];
    const hit = (f: (typeof found)[number]) =>
      want.find((m) => m.verse === words[f.word].verse && m.word === words[f.word].inVerse && m.heard === f.heard);
    const fileCaught = want.filter((m) => found.some((f) => hit(f) === m));
    const fileFalse = found.filter((f) => !hit(f));
    caught += fileCaught.length;
    missed += want.length - fileCaught.length;
    falseAlarms += fileFalse.length;
    const top = [...margins].sort((a, b) => b.margin - a.margin).slice(0, 3);
    console.log(`\n${basename(file)}  ${(audio.length / 16000).toFixed(1)} s audio, ${Math.round(ms)} ms`);
    console.log(`  heard: ${heard.join(" ")}`);
    for (const f of found) {
      const w = words[f.word];
      console.log(`  ${hit(f) ? "CAUGHT" : "FALSE "} ${w.verse}:${w.inVerse + 1} ${w.text} → ${f.said}  ${f.want}→${f.heard}  margin ${f.margin.toFixed(1)}`);
    }
    for (const m of want.filter((m) => !fileCaught.includes(m))) console.log(`  MISSED ${m.verse}:${m.word + 1} (said ${m.heard})`);
    console.log(`  highest margins: ${top.map((m) => `${target[m.word]} ${m.want}→${m.alt} ${m.margin.toFixed(1)}`).join(" | ")}`);
    report.push({ file: basename(file), surah, from, to, heard: heard.join(" "), found: found.map((f) => ({ ...f, verse: words[f.word].verse, inVerse: words[f.word].inVerse, text: words[f.word].text })) });
  }
  console.log(`\nmistakes caught ${caught}, missed ${missed}; false alarms ${falseAlarms} on ${judgedWords} judged words (margin > ${VOWEL_MARGIN})`);
  if (flag("json")) writeFileSync(flag("json")!, JSON.stringify(report, null, 1));
}
void main();
