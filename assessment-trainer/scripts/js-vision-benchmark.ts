/**
 * Benchmark for the in-browser (pure TypeScript) vision pipeline:
 *   1. per-object extraction accuracy on test-data/screenshots
 *   2. end-to-end answers on freshly rendered screenshots (PNG, JPEG, scaled)
 *
 *   npx tsx scripts/js-vision-benchmark.ts [perCategory]
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { analyzeRgba } from "../lib/vision/js/pipeline";
import { toProblem } from "../lib/vision/problem";
import { solveMatrix } from "../lib/solver/solve";
import { generateQuestion } from "../lib/matrigma/generator";
import { renderScreenshotSvg } from "../lib/matrigma/render";
import { MATRIGMA_CATEGORIES, type Difficulty, type Cell, type MatrigmaCategory } from "../lib/matrigma/types";
import { rotationDistance } from "../lib/matrigma/geometry";

export async function decode(buf: Buffer) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

function compareCells(truth: Cell, pred: Cell, stats: Record<string, number>, label: string, verbose: boolean) {
  stats.cells++;
  if (truth.objects.length === pred.objects.length) stats.count++;
  else if (verbose) console.log("  count", label, truth.objects.length, pred.objects.length);
  for (const t of truth.objects) {
    stats.objects++;
    const p = pred.objects.reduce<Cell["objects"][number] | null>((b, o) => (!b || Math.hypot(o.x - t.x, o.y - t.y) < Math.hypot(b.x - t.x, b.y - t.y) ? o : b), null);
    if (!p || Math.hypot(p.x - t.x, p.y - t.y) > 0.12) continue;
    const shape = p.shape === t.shape;
    const rot = shape && rotationDistance(t.shape, t.rotation, p.rotation) <= 10;
    const fill = p.fill === t.fill;
    const size = Math.abs(p.size - t.size) <= 0.07;
    stats.shape += +shape;
    stats.rot += +rot;
    stats.fill += +fill;
    stats.size += +size;
    if (verbose && !(shape && rot && fill && size)) console.log("  obj", label, t.shape, t.fill, t.size, t.rotation, "->", p.shape, p.fill, p.size.toFixed(2), p.rotation);
  }
}

export async function fixtureAccuracy(verbose = false) {
  const dir = path.join(process.cwd(), "test-data", "screenshots");
  const stats: Record<string, number> = { files: 0, ok: 0, cells: 0, count: 0, objects: 0, shape: 0, rot: 0, fill: 0, size: 0 };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".png"))) {
    const truth = JSON.parse(fs.readFileSync(path.join(dir, f.replace(".png", ".json")), "utf8"));
    const v = analyzeRgba(await decode(fs.readFileSync(path.join(dir, f))));
    stats.files++;
    if (!v.ok) {
      if (verbose) console.log(f, "FAILED", v.error);
      continue;
    }
    stats.ok++;
    const { problem } = toProblem(v);
    truth.problem.cells.forEach((c: Cell | null, i: number) => c && problem.cells[i] && compareCells(c, problem.cells[i]!, stats, `${f} cell${i}`, verbose));
    truth.problem.options.forEach((c: Cell, i: number) => problem.options[i] && compareCells(c, problem.options[i], stats, `${f} opt${i}`, verbose));
  }
  return stats;
}

export async function endToEnd(per: number, seedBase = 91000, verbose = false, categories: readonly MatrigmaCategory[] = MATRIGMA_CATEGORIES) {
  const variants = [
    { name: "png", scale: 1, jpeg: false, chrome: true },
    { name: "jpeg q70", scale: 1, jpeg: true, chrome: true },
    { name: "small x0.7", scale: 0.7, jpeg: false, chrome: false },
  ];
  const diffs: Difficulty[] = ["easy", "medium", "hard", "expert"];
  const tot = { n: 0, correct: 0, wrong: 0, abstain: 0, fail: 0 };
  for (const category of categories)
    for (const v of variants)
      for (let i = 0; i < per; i++) {
        const q = generateQuestion({ category, difficulty: category === "multi-rule" ? "hard" : diffs[i % 4], seed: seedBase + i * 613 });
        const { svg } = renderScreenshotSvg(q.problem, { chrome: v.chrome });
        const img = sharp(Buffer.from(svg), { density: 72 * v.scale });
        const buf = v.jpeg ? await img.jpeg({ quality: 70 }).toBuffer() : await img.png().toBuffer();
        const vis = analyzeRgba(await decode(buf));
        tot.n++;
        if (!vis.ok) {
          tot.fail++;
          if (verbose) console.log("fail", q.id, v.name, vis.error);
          continue;
        }
        const s = solveMatrix(toProblem(vis).problem, { extractionQuality: vis.quality });
        if (s.answer === null) tot.abstain++;
        else if (s.answer === q.correctAnswer) tot.correct++;
        else {
          tot.wrong++;
          if (verbose) console.log("WRONG", q.id, v.name, s.confidence.toFixed(2), s.status);
        }
      }
  return tot;
}

if (process.argv[1]?.includes("js-vision-benchmark")) {
  (async () => {
    const verbose = process.argv.includes("-v");
    const per = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 5);
    console.log("Fixture extraction:", await fixtureAccuracy(verbose));
    const t = Date.now();
    const e = await endToEnd(per, 91000, verbose);
    console.log(`End-to-end (${e.n} screenshots, ${((Date.now() - t) / e.n).toFixed(0)} ms each):`, e, `correct ${((e.correct / e.n) * 100).toFixed(1)}%, wrong ${((e.wrong / e.n) * 100).toFixed(1)}%`);
  })();
}
