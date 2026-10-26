/**
 * Renders synthetic questions to PNG "screenshots" (with browser chrome, timer
 * and buttons) plus a JSON ground-truth file. Used by the Python vision tests
 * and the end-to-end vision benchmark.
 *
 *   npm run test-data            # 3 per category into test-data/screenshots
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { generateQuestion } from "../lib/matrigma/generator";
import { MATRIGMA_CATEGORIES, type Difficulty, type MatrigmaCategory, type GeneratedMatrixQuestion } from "../lib/matrigma/types";
import { renderScreenshotSvg } from "../lib/matrigma/render";

export async function renderQuestionPng(q: GeneratedMatrixQuestion, opts: { chrome?: boolean; cell?: number; scale?: number } = {}) {
  const { svg } = renderScreenshotSvg(q.problem, { chrome: opts.chrome ?? true, cell: opts.cell });
  let img = sharp(Buffer.from(svg), { density: 72 * (opts.scale ?? 1) });
  return img.png().toBuffer();
}

export async function writeFixture(dir: string, q: GeneratedMatrixQuestion, opts: { chrome?: boolean; cell?: number; format?: "png" | "jpg" } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const png = await renderQuestionPng(q, opts);
  const file = path.join(dir, `${q.id}.${opts.format ?? "png"}`);
  if (opts.format === "jpg") await sharp(png).jpeg({ quality: 85 }).toFile(file);
  else fs.writeFileSync(file, png);
  fs.writeFileSync(
    path.join(dir, `${q.id}.json`),
    JSON.stringify({ id: q.id, category: q.category, difficulty: q.difficulty, correctAnswer: q.correctAnswer, rules: q.rules, problem: q.problem }, null, 1),
  );
  return file;
}

const isMain = process.argv[1]?.includes("generate-test-data");
if (isMain) {
  (async () => {
    const dir = path.join(process.cwd(), "test-data", "screenshots");
    const per = Number(process.argv[2] ?? 2);
    const diffs: Difficulty[] = ["easy", "hard"];
    let n = 0;
    for (const category of MATRIGMA_CATEGORIES as readonly MatrigmaCategory[]) {
      for (let i = 0; i < per; i++) {
        const q = generateQuestion({ category, difficulty: category === "multi-rule" ? "hard" : diffs[i % 2], seed: 5000 + i * 31 + category.length });
        await writeFixture(dir, q, { chrome: i % 2 === 0 });
        n++;
      }
    }
    console.log(`Wrote ${n} screenshots to ${dir}`);
  })();
}
