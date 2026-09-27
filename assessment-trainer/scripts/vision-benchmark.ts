/**
 * End-to-end benchmark: synthetic question -> rendered screenshot (PNG/JPEG,
 * several scales, with/without browser chrome) -> Python/OpenCV vision ->
 * solver -> compare with the known answer.
 *
 *   npm run benchmark:vision            # 10 per category
 *   npm run benchmark:vision -- 25
 */
import sharp from "sharp";
import { generateQuestion } from "../lib/matrigma/generator";
import { MATRIGMA_CATEGORIES, type Difficulty } from "../lib/matrigma/types";
import { renderScreenshotSvg } from "../lib/matrigma/render";
import { analyzeWithPython } from "../lib/vision/python";
import { toProblem } from "../lib/vision/problem";
import { solveMatrix } from "../lib/solver/solve";

const VARIANTS = [
  { name: "png", scale: 1, jpeg: false, chrome: true },
  { name: "jpeg q70", scale: 1, jpeg: true, chrome: true },
  { name: "small x0.7", scale: 0.7, jpeg: false, chrome: false },
];

export async function runVisionBenchmark(per = 10, seedBase = 77000) {
  const rows: { category: string; variant: string; n: number; correct: number; wrong: number; abstained: number; visionFail: number }[] = [];
  const diffs: Difficulty[] = ["easy", "medium", "hard", "expert"];
  for (const category of MATRIGMA_CATEGORIES) {
    for (const v of VARIANTS) {
      const r = { category, variant: v.name, n: 0, correct: 0, wrong: 0, abstained: 0, visionFail: 0 };
      for (let i = 0; i < per; i++) {
        const q = generateQuestion({ category, difficulty: category === "multi-rule" ? "hard" : diffs[i % 4], seed: seedBase + i * 977 });
        const { svg } = renderScreenshotSvg(q.problem, { chrome: v.chrome });
        let img = sharp(Buffer.from(svg), { density: 72 * v.scale });
        const buf = v.jpeg ? await img.jpeg({ quality: 70 }).toBuffer() : await img.png().toBuffer();
        r.n++;
        const vis = await analyzeWithPython(buf);
        if (!vis.ok) {
          r.visionFail++;
          continue;
        }
        const { problem } = toProblem(vis);
        const s = solveMatrix(problem, { extractionQuality: vis.quality });
        if (s.answer === null) r.abstained++;
        else if (s.answer === q.correctAnswer) r.correct++;
        else r.wrong++;
      }
      rows.push(r);
    }
  }
  return rows;
}

if (process.argv[1]?.includes("vision-benchmark")) {
  (async () => {
    const per = Number(process.argv[2] ?? 10);
    const rows = await runVisionBenchmark(per);
    console.log(`\nVision + solver benchmark — ${per} per category and variant\n`);
    console.log("category       variant      n  correct wrong abstain visionFail");
    for (const r of rows)
      console.log(`${r.category.padEnd(14)} ${r.variant.padEnd(11)} ${String(r.n).padStart(3)} ${String(r.correct).padStart(8)} ${String(r.wrong).padStart(5)} ${String(r.abstained).padStart(7)} ${String(r.visionFail).padStart(10)}`);
    const t = rows.reduce((a, r) => ({ n: a.n + r.n, c: a.c + r.correct, w: a.w + r.wrong }), { n: 0, c: 0, w: 0 });
    console.log(`\nOverall: ${((t.c / t.n) * 100).toFixed(1)}% correct, ${((t.w / t.n) * 100).toFixed(1)}% wrong (rest abstained or not detected)`);
  })();
}
