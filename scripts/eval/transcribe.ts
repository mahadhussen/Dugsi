// Runs real recitation audio through the same pipeline the app uses — the
// segmenter, then Tarteel's Quran model on each piece — and writes what the
// model actually heard as a test fixture. The follower's tests then run on
// genuine model output instead of text we made up.
//
// Needs @huggingface/transformers (the app loads it from a CDN, so it is not a
// dependency here). Install it anywhere and point at it:
//   npm i --prefix /tmp/tjs @huggingface/transformers@3.3.3
//   npx tsx scripts/eval/transcribe.ts --tjs /tmp/tjs --audio <dir> --out test/fixtures/recite \
//     name=file.f32:surah[:note] ...
// Audio files are raw 16 kHz mono float32 (ffmpeg -ac 1 -ar 16000 -f f32le).
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { segmentAll } from "../../lib/listen/segmenter";
import { ASR_MODEL } from "../../lib/listen/model";
import { isJoinCandidate } from "../../lib/listen/policy";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`missing --${name}`);
  return process.argv[i + 1];
}

const tjs = arg("tjs");
const audioDir = arg("audio");
const outDir = arg("out");
const jobs = process.argv.slice(2).filter((a) => a.includes("=") && !a.startsWith("--"));

async function main(): Promise<void> {
const require = createRequire(join(tjs, "package.json"));
const mod = await import(require.resolve("@huggingface/transformers"));
const { pipeline } = (mod.pipeline ? mod : mod.default) as { pipeline: (...a: unknown[]) => Promise<any> };
const asr = await pipeline("automatic-speech-recognition", ASR_MODEL.id, {
  revision: ASR_MODEL.revision,
  dtype: { encoder_model: ASR_MODEL.encoderDtype, decoder_model_merged: ASR_MODEL.decoderDtype },
});

mkdirSync(outDir, { recursive: true });
for (const job of jobs) {
  const [name, spec] = job.split("=");
  const [file, surah, ...noteParts] = spec.split(":");
  const b = readFileSync(join(audioDir, file));
  const pcm = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  const pieces = segmentAll(pcm).flatMap((e) => (e.type === "segment" ? [e.segment] : []));
  type Words = { text: string; start: number; end: number }[];
  type Out = { t0: number; t1: number; startSample: number; endSample: number; byPause: boolean; text: string; words: Words; voiced: [number, number][] };
  const segments: Out[] = [];
  const joins: { of: [number, number]; text: string; words: Words }[] = [];
  let ms = 0;
  const decode = async (audio: Float32Array) => {
    const t = Date.now();
    const out = await asr(audio, { language: "arabic", task: "transcribe", return_timestamps: "word" });
    ms += Date.now() - t;
    const words = (out.chunks ?? [])
      .filter((c: any) => c && Array.isArray(c.timestamp))
      .map((c: any) => ({ text: String(c.text ?? "").trim(), start: +(c.timestamp[0] ?? 0).toFixed(2), end: +(c.timestamp[1] ?? c.timestamp[0] ?? 0).toFixed(2) }))
      .filter((w: { text: string }) => w.text.length > 0);
    return { text: String(out.text ?? "").trim(), words };
  };
  const secs = (n: number) => +(n / 16000).toFixed(3);
  for (const p of pieces) {
    const prev = segments[segments.length - 1] ?? null;
    const span = { t0: secs(p.startSample), t1: secs(p.endSample) };
    const voiced = p.voiced.map(([a, b]) => [secs(a), secs(b)] as [number, number]);
    const r = await decode(p.audio);
    segments.push({ ...span, startSample: p.startSample, endSample: p.endSample, byPause: p.byPause, ...r, voiced });
    if (prev && isJoinCandidate(prev, span, r.text.split(/\s+/).filter(Boolean).length)) {
      const j = await decode(pcm.slice(prev.startSample, p.endSample));
      joins.push({ of: [segments.length - 2, segments.length - 1], ...j });
    }
  }
  const fixture = {
    name,
    surah: Number(surah),
    note: noteParts.join(":"),
    audio: file,
    seconds: +(pcm.length / 16000).toFixed(2),
    model: `${ASR_MODEL.id}@${ASR_MODEL.revision.slice(0, 7)}`,
    segments: segments.map(({ startSample, endSample, ...rest }) => rest),
    joins,
  };
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(fixture, null, 1) + "\n");
  console.log(`${name}: ${segments.length} pieces, ${ms} ms model time`);
  for (const s of segments) console.log(`  ${s.t0.toFixed(1)}-${s.t1.toFixed(1)}  ${s.text}`);
  for (const j of joins) console.log(`  join ${j.of.join('+')}: ${j.text}`);
}
}

void main();
