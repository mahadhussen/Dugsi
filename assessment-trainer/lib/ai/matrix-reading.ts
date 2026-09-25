import { jsonCall } from "./anthropic";

/**
 * Fallback for matrix layouts the local pipeline cannot read (no cell borders,
 * line textures, 8 numbered options, …): Claude describes every cell, tests
 * rules along rows and columns, checks every option and may abstain.
 *
 * The result is labelled as an AI reading in the UI: it is NOT verified by the
 * local rule solver, and it is only shown as an answer when Claude is confident
 * and exactly one option fits.
 */

export interface AiMatrixReading {
  isMatrixQuestion: boolean;
  layout: { rows: number; cols: number; emptyRow: number; emptyCol: number; optionLabels: string[]; notes: string };
  cells: { row: number; col: number; description: string }[];
  rules: { appliesTo: string; part: string; description: string; holds: boolean }[];
  prediction: string;
  options: { label: string; description: string; matches: boolean; difference: string }[];
  answer: string | null;
  confidence: number;
  explanation: string;
}

export interface AiMatrixVerdict {
  /** The answer shown to the user, or null when the reading is not certain enough. */
  answer: string | null;
  confidence: number;
  status: "solved" | "uncertain";
  /** Why no answer is shown (only when status is "uncertain"). */
  reason: string | null;
}

/** Minimum model confidence before an AI reading is shown as an answer. */
export const AI_MIN_CONFIDENCE = 0.6;

export function aiMatrixFallbackEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && process.env.AI_MATRIX_FALLBACK !== "off";
}

export const MATRIX_PROMPT = `The image is a screenshot of a PRACTICE matrix reasoning question (Raven / Matrigma style) that a person is using to train. Solve it carefully and explain it so they can learn the rule.

Work in this order and fill the JSON fields in this order:
1. isMatrixQuestion: false if the image is not a matrix reasoning question (then leave the other fields minimal and answer null).
2. layout: find the matrix (usually 3x3), which cell is empty (blank, a "?" or an empty outlined box; rows and columns count from 1), and every answer option with its label exactly as printed (letters or numbers). If options are unlabelled, number them 1, 2, 3 ... left to right, top to bottom, and say so in notes.
3. cells: describe EVERY filled matrix cell precisely: background texture or line pattern (direction, straight or curved, spacing), foreground elements (thick bars, dots, shapes), counts, orientation, fill, position.
4. rules: look for rules along rows AND along columns: overlay/union of two cells, subtraction, XOR (keep only what differs), each row containing the same three values, progression, rotation, count changes. Different parts of the picture can follow different rules (for example the background by columns and the foreground by rows). Check each rule against every complete row or column and record whether it holds.
5. prediction: describe exactly what the empty cell must contain.
6. options: compare EVERY option with the prediction and name any difference (an extra dot, a missing line family, a wrong orientation). matches is true only for an option with no difference.
7. answer: the label of the single option that matches. If no option matches, or two or more match equally well, or the image is too unclear to be sure, answer null. Never guess.
8. confidence: 0 to 1, below 0.6 when you are unsure.
9. explanation: 2-4 sentences a learner can follow.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["isMatrixQuestion", "layout", "cells", "rules", "prediction", "options", "answer", "confidence", "explanation"],
  properties: {
    isMatrixQuestion: { type: "boolean" },
    layout: {
      type: "object",
      additionalProperties: false,
      required: ["rows", "cols", "emptyRow", "emptyCol", "optionLabels", "notes"],
      properties: {
        rows: { type: "integer" },
        cols: { type: "integer" },
        emptyRow: { type: "integer" },
        emptyCol: { type: "integer" },
        optionLabels: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
    },
    cells: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["row", "col", "description"],
        properties: { row: { type: "integer" }, col: { type: "integer" }, description: { type: "string" } },
      },
    },
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["appliesTo", "part", "description", "holds"],
        properties: { appliesTo: { type: "string" }, part: { type: "string" }, description: { type: "string" }, holds: { type: "boolean" } },
      },
    },
    prediction: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "description", "matches", "difference"],
        properties: { label: { type: "string" }, description: { type: "string" }, matches: { type: "boolean" }, difference: { type: "string" } },
      },
    },
    answer: { anyOf: [{ type: "string" }, { type: "null" }] },
    confidence: { type: "number" },
    explanation: { type: "string" },
  },
} as const;

/** Decide whether an AI reading may be shown as an answer. Pure, so it is unit-tested. */
export function judgeReading(r: AiMatrixReading): AiMatrixVerdict {
  const confidence = Math.max(0, Math.min(1, Number(r.confidence) || 0));
  const answer = (r.answer ?? "").trim();
  const fitting = r.options.filter((o) => o.matches);
  const labels = r.options.map((o) => o.label.trim());
  const uncertain = (reason: string): AiMatrixVerdict => ({ answer: null, confidence, status: "uncertain", reason });
  if (!r.isMatrixQuestion) return uncertain("The image does not look like a matrix question.");
  if (!answer) return uncertain(fitting.length > 1 ? `Options ${fitting.map((o) => o.label).join(", ")} fit equally well.` : "No option could be matched with enough certainty.");
  if (fitting.length > 1) return uncertain(`Options ${fitting.map((o) => o.label).join(", ")} fit equally well.`);
  if (labels.length && !labels.includes(answer)) return uncertain(`The suggested label "${answer}" is not one of the options that were read.`);
  if (fitting.length === 1 && fitting[0].label.trim() !== answer) return uncertain("The answer and the option-by-option check disagree.");
  if (r.rules.length && r.rules.every((x) => !x.holds)) return uncertain("None of the rules held on the complete rows and columns.");
  if (confidence < AI_MIN_CONFIDENCE) return uncertain(`Claude leaned towards ${answer} but with only ${Math.round(confidence * 100)} % confidence.`);
  return { answer, confidence, status: "solved", reason: null };
}

/**
 * Combine independent readings: an answer is shown only when every reading that
 * finished is confident and they all name the same option. Any disagreement
 * turns the result into "uncertain" (fewer answers, but far fewer wrong ones).
 */
export function combineVerdicts(verdicts: AiMatrixVerdict[]): AiMatrixVerdict {
  if (!verdicts.length) return { answer: null, confidence: 0, status: "uncertain", reason: "No reading finished." };
  const answers = verdicts.map((v) => v.answer);
  const confidence = Math.min(...verdicts.map((v) => v.confidence));
  if (verdicts.some((v) => v.status !== "solved")) {
    const firstReason = verdicts.find((v) => v.status !== "solved")?.reason ?? "";
    return { answer: null, confidence, status: "uncertain", reason: verdicts.length > 1 ? `Not all ${verdicts.length} independent readings were certain. ${firstReason}` : firstReason };
  }
  if (new Set(answers).size > 1) {
    return { answer: null, confidence, status: "uncertain", reason: `Independent readings disagree (${answers.join(", ")}), so no answer is given.` };
  }
  return { answer: answers[0], confidence, status: "solved", reason: null };
}

/** Number of independent readings per image (AI_MATRIX_VOTES, default 3, max 5). */
export function voteCount(): number {
  const n = Number(process.env.AI_MATRIX_VOTES ?? 3);
  return Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : 3;
}

async function readOnce(image: Buffer, mime: string): Promise<AiMatrixReading> {
  return jsonCall<AiMatrixReading>(
    [
      { type: "image", source: { type: "base64", media_type: mime as "image/png" | "image/jpeg" | "image/webp", data: image.toString("base64") } },
      { type: "text", text: MATRIX_PROMPT },
    ],
    SCHEMA as unknown as Record<string, unknown>,
    { effort: "high", maxTokens: 16000 },
  );
}

export async function readMatrixWithClaude(
  image: Buffer,
  mime: string,
): Promise<{ reading: AiMatrixReading; verdict: AiMatrixVerdict; durationMs: number; votes: { answer: string | null; confidence: number }[] }> {
  const t0 = Date.now();
  const settled = await Promise.allSettled(Array.from({ length: voteCount() }, () => readOnce(image, mime)));
  const readings = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (!readings.length) throw (settled.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
  const verdicts = readings.map(judgeReading);
  const verdict = combineVerdicts(verdicts);
  // Show the reading that matches the combined answer (or the first one).
  const shown = readings[Math.max(0, verdicts.findIndex((v) => v.answer === verdict.answer))];
  return { reading: shown, verdict, durationMs: Date.now() - t0, votes: verdicts.map((v) => ({ answer: v.answer, confidence: v.confidence })) };
}
