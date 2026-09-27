/**
 * Solver benchmark: generates synthetic questions with known answers and
 * reports accuracy per category and per difficulty.
 *
 *   npm run benchmark            # 100 per category (default)
 *   npm run benchmark -- 300     # 300 per category
 */
import { generateQuestion } from "../lib/matrigma/generator";
import { MATRIGMA_CATEGORIES, type Difficulty, type MatrigmaCategory } from "../lib/matrigma/types";
import { solveMatrix } from "../lib/solver/solve";
import { calibrationTable } from "../lib/statistics/calibration";

export interface BenchRow {
  category: string;
  n: number;
  correct: number;
  wrong: number;
  abstained: number;
  accuracy: number;
  answeredAccuracy: number;
  avgConfidence: number;
  avgMs: number;
}

export function runBenchmark(perCategory = 100, categories: readonly MatrigmaCategory[] = MATRIGMA_CATEGORIES, seedBase = 1000) {
  const rows: BenchRow[] = [];
  const points: { confidence: number; correct: boolean }[] = [];
  const failures: { id: string; expected: number; got: number | null; status: string }[] = [];
  const difficulties: Difficulty[] = ["easy", "medium", "hard", "expert"];
  for (const category of categories) {
    let correct = 0;
    let wrong = 0;
    let abstained = 0;
    let conf = 0;
    let ms = 0;
    for (let i = 0; i < perCategory; i++) {
      const difficulty = category === "multi-rule" ? (i % 2 ? "expert" : "hard") : difficulties[i % 4];
      const q = generateQuestion({ category, difficulty, seed: seedBase + i * 104729 + category.length * 13 });
      const s = solveMatrix(q.problem);
      ms += s.durationMs;
      conf += s.confidence;
      const ok = s.answer === q.correctAnswer;
      if (s.answer === null) abstained++;
      else if (ok) correct++;
      else wrong++;
      if (!ok) failures.push({ id: q.id, expected: q.correctAnswer, got: s.answer, status: s.status });
      points.push({ confidence: s.confidence, correct: ok });
    }
    rows.push({
      category,
      n: perCategory,
      correct,
      wrong,
      abstained,
      accuracy: correct / perCategory,
      answeredAccuracy: correct / Math.max(1, correct + wrong),
      avgConfidence: conf / perCategory,
      avgMs: ms / perCategory,
    });
  }
  return { rows, calibration: calibrationTable(points), failures };
}

const isMain = process.argv[1]?.includes("benchmark");
if (isMain) {
  const n = Number(process.argv[2] ?? 100);
  const { rows, calibration, failures } = runBenchmark(n);
  console.log(`\nSolver benchmark — ${n} questions per category\n`);
  console.log("category        n    correct wrong abstain  accuracy  conf   ms");
  for (const r of rows) {
    console.log(
      `${r.category.padEnd(14)} ${String(r.n).padStart(4)} ${String(r.correct).padStart(8)} ${String(r.wrong).padStart(5)} ${String(r.abstained).padStart(7)}  ${(r.accuracy * 100).toFixed(1).padStart(6)}%  ${(r.avgConfidence * 100).toFixed(0).padStart(3)}%  ${r.avgMs.toFixed(1)}`,
    );
  }
  const total = rows.reduce((s, r) => s + r.correct, 0) / rows.reduce((s, r) => s + r.n, 0);
  console.log(`\nOverall accuracy: ${(total * 100).toFixed(1)}%`);
  console.log("\nConfidence calibration (solver confidence vs actual correctness):");
  for (const b of calibration) {
    if (b.n) console.log(`  ${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%: ${b.n} questions, ${(b.accuracy * 100).toFixed(1)}% correct`);
  }
  if (failures.length) console.log(`\nFirst failures: ${failures.slice(0, 15).map((f) => `${f.id} (exp ${f.expected}, got ${f.got}, ${f.status})`).join("\n  ")}`);
}
