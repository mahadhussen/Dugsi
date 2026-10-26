/** Debug helper: npx tsx scripts/debug-question.ts <category> <difficulty> <seed> */
import { generateQuestion } from "../lib/matrigma/generator";
import type { Difficulty, MatrigmaCategory } from "../lib/matrigma/types";
import { solveMatrix } from "../lib/solver/solve";
import { cellFeatures } from "../lib/solver/features";

const [category, difficulty, seed] = process.argv.slice(2);
const q = generateQuestion({ category: category as MatrigmaCategory, difficulty: difficulty as Difficulty, seed: Number(seed) });
console.log(q.id, "answer", q.correctAnswer, q.ruleText);
q.problem.cells.forEach((c, i) => {
  if (!c) return console.log(i, "MISSING");
  const f = cellFeatures(c);
  console.log(i, JSON.stringify({ ...f, objects: undefined }));
});
q.problem.options.forEach((c, i) => console.log("opt", i, JSON.stringify({ ...cellFeatures(c), objects: undefined })));
const s = solveMatrix(q.problem);
console.log(s.status, s.answer, s.confidence.toFixed(2), s.optionScores.map((x) => x.toFixed(2)).join(" "));
for (const st of s.strategies.filter((x) => x.applicable)) {
  console.log(st.id, st.weight.toFixed(2), st.optionScores.map((x) => x.toFixed(2)).join(" "), st.rules.map((r) => `${r.attribute}/${r.kind}/${r.axis}`).join(", "));
}
