/** Debug helper: npx tsx scripts/explain-question.ts <category> <difficulty> <seed> */
import { generateQuestion } from "../lib/matrigma/generator";
import type { Difficulty, MatrigmaCategory } from "../lib/matrigma/types";
import { solveMatrix } from "../lib/solver/solve";
import { collectCandidates } from "../lib/solver/decision";
import { fitAttributeRules } from "../lib/solver/rules";
import { cellFeatures } from "../lib/solver/features";

const [c, d, s] = process.argv.slice(2);
const q = generateQuestion({ category: c as MatrigmaCategory, difficulty: d as Difficulty, seed: Number(s) });
const r = solveMatrix(q.problem);
console.log(q.id, q.ruleText, "| expected", q.correctAnswer, "got", r.answer, r.status, r.confidence.toFixed(2));
console.log("combined", r.optionScores.map((x) => x.toFixed(2)).join(" "));
const features = q.problem.cells.map((x) => (x ? cellFeatures(x) : null));
const optionFeatures = q.problem.options.map(cellFeatures);
const cands = collectCandidates(q.problem, 8, fitAttributeRules({ problem: q.problem, features, optionFeatures, missing: 8 }));
for (const k of cands) console.log(k.key.padEnd(34), "cov", k.coverage, "cx", k.complexity.toFixed(1), k.optionScores.map((x) => x.toFixed(2)).join(" "));
console.log(r.explanation.notes.join("\n"));
