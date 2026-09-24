import type { MatrixProblem } from "../matrigma/types";
import { OPTION_LABELS } from "../matrigma/types";
import type { Explanation, Solution } from "./types";

export function questionTypeLabel(p: MatrixProblem): string {
  if (p.rows === 1) return `Sequence of ${p.cols} figures`;
  return `${p.rows}×${p.cols} matrix`;
}

/** Turn a solution into the pedagogical QUESTION TYPE / RULE / VALIDATION / ANSWER block. */
export function buildExplanation(problem: MatrixProblem, s: Solution): Explanation {
  const informative = s.rules.filter((r) => r.informative);
  const constants = s.rules.filter((r) => !r.informative);
  const rules = informative.map((r) => r.text);
  if (constants.length) {
    const attrs = [...new Set(constants.map((r) => r.attribute))];
    rules.push(`Unchanged along the ${constants[0].axis === "col" ? "columns" : "rows"}: ${attrs.join(", ")}.`);
  }
  const validation: string[] = [];
  const seen = new Set<string>();
  for (const r of informative.length ? informative : constants) {
    for (const v of r.validation) {
      const key = `${v.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      validation.push(`${v.label} ${v.ok ? "✓" : "✗"}`);
    }
  }
  const missingCell = informative.map((r) => r.prediction).filter((x): x is string => !!x);
  const notes = [...s.explanation.notes];
  let answer: string;
  if (s.status === "unsolved") {
    answer = "No answer — no rule could be verified.";
  } else if (s.answer === null) {
    answer = `Undecided between ${s.candidates.map((i) => OPTION_LABELS[i]).join(" / ")}`;
    notes.push("Several options satisfy the verified rules equally well.");
  } else {
    answer = OPTION_LABELS[s.answer];
  }
  if (s.status === "uncertain") notes.push("Uncertain – inspect manually.");
  if ((s.confidenceFactors.extraction ?? 1) < 0.8) notes.push("Visual extraction quality is low; the detected shapes may be wrong.");
  if (informative.length === 0 && s.status !== "unsolved") notes.push("Only 'unchanged' rules were found; the answer is chosen by elimination.");
  return {
    questionType: questionTypeLabel(problem),
    rules,
    validation,
    missingCell,
    answer,
    confidence: `${Math.round(s.confidence * 100)}%`,
    notes,
  };
}
