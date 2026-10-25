// Run the segmenter over raw 16 kHz mono float32 files and print the pieces.
// Usage: npx tsx scripts/eval/segments.ts <dir> <file.f32> [...]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { segmentAll } from "../../lib/listen/segmenter";

const [dir, ...files] = process.argv.slice(2);
for (const f of files) {
  const b = readFileSync(join(dir, f));
  const pcm = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  const ev = segmentAll(pcm, { silenceMarks: [2500] });
  const segs = ev.flatMap((e) => (e.type === "segment" ? [e.segment] : []));
  console.log(`${f}: ${(pcm.length / 16000).toFixed(1)} s -> ${segs.length} pieces`);
  console.log("  " + segs.map((s) => `${(s.startSample / 16000).toFixed(2)}-${(s.endSample / 16000).toFixed(2)}${s.byPause ? "" : "*"}`).join("  "));
}
