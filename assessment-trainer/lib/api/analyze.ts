import { getProviders } from "../ai";
import { toProblem } from "../vision/problem";
import { solveMatrix } from "../solver/solve";
import { extractStatement } from "../map/ocr-text";
import { getCalibration, saveScreenshotQuestion } from "../database/repo";
import { prisma } from "../database/client";
import type { VisionFailure } from "../vision/types";

export const ACCEPTED_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const MAX_BYTES = 10 * 1024 * 1024;

export type Stage = "uploading" | "processing" | "detecting" | "analyzing" | "validating";
type Emit = (e: { stage: Stage; status: "active" | "done"; detail?: string }) => void;

export function validateUpload(file: { type: string; size: number } | null): string | null {
  if (!file) return "No file uploaded.";
  if (!ACCEPTED_TYPES[file.type]) return "Unsupported file type. Use PNG, JPG or WEBP.";
  if (file.size > MAX_BYTES) return "File is larger than 10 MB.";
  if (file.size === 0) return "The file is empty.";
  return null;
}

function failure(v: VisionFailure) {
  const problems: Record<string, string> = {
    decode: "The image could not be decoded.",
    matrix: "No regular grid of equally sized cells was found.",
    options: "The matrix was found, but not the row of answer options.",
    missing_cell: "The grid was found, but exactly one missing cell could not be identified.",
    internal: "The vision pipeline hit an internal error.",
  };
  return {
    type: "error" as const,
    message: "Unable to reliably detect the matrix.",
    problem: problems[v.stage] ?? v.error,
    detail: v.error,
    stage: v.stage,
    region: v.region ?? null,
    candidateBoxes: v.candidateBoxes ?? [],
    imageSize: v.imageSize ?? null,
  };
}

/**
 * Screenshot analysis pipeline. mode: "auto" tries matrix detection first and
 * falls back to OCR (MAP statement) when no matrix is visible.
 */
export async function analyzeImage(buffer: Buffer, mime: string, mode: "auto" | "matrigma" | "map", emit: Emit) {
  const providers = getProviders();
  emit({ stage: "uploading", status: "done", detail: `${Math.round(buffer.length / 1024)} KB` });

  if (mode !== "map") {
    emit({ stage: "processing", status: "active" });
    const vision = await providers.vision.extractMatrix(buffer, mime);
    emit({ stage: "processing", status: "done", detail: vision.preprocessing?.join(" → ") });
    emit({ stage: "detecting", status: "active" });
    if (vision.ok) {
      emit({ stage: "detecting", status: "done", detail: `${vision.matrix.rows}×${vision.matrix.columns} matrix, ${vision.answerOptions} options` });
      emit({ stage: "analyzing", status: "active" });
      const { problem, unknownObjects } = toProblem(vision);
      const quality = vision.quality * (unknownObjects ? 0.6 : 1);
      const solution = solveMatrix(problem, { extractionQuality: quality, calibration: await getCalibration() });
      emit({ stage: "analyzing", status: "done", detail: `${solution.strategies.filter((s) => s.applicable).length} strategies applicable` });
      emit({ stage: "validating", status: "active" });
      let narrative: string | null = null;
      try {
        narrative = await providers.reasoning.explain(problem, solution);
      } catch {
        narrative = null;
      }
      const ext = (ACCEPTED_TYPES[mime] ?? "png") as string;
      const saved = await saveScreenshotQuestion({
        problem,
        solverAnswer: solution.answer,
        confidence: solution.confidence,
        strategy: solution.strategy,
        rule: solution.explanation.rules.join(" "),
        image: { buffer, ext },
      });
      emit({ stage: "validating", status: "done", detail: solution.validated ? "rules verified" : "not fully verified" });
      return {
        type: "matrigma" as const,
        questionId: saved.id,
        imageStored: saved.imageStored,
        vision: { ...vision, problem: undefined },
        problem,
        solution,
        narrative,
        unknownObjects,
      };
    }
    emit({ stage: "detecting", status: "done", detail: vision.error });
    if (mode === "matrigma") return failure(vision);
    // Auto mode: a screenshot without a matrix may be a MAP statement.
    const ocr = await tryMap(buffer, mime, emit);
    return ocr ?? failure(vision);
  }
  emit({ stage: "processing", status: "done" });
  const ocr = await tryMap(buffer, mime, emit);
  return (
    ocr ?? {
      type: "error" as const,
      message: "Unable to read a statement from the screenshot.",
      problem: "No sentence-like text was found.",
      detail: "",
      stage: "ocr",
      region: null,
      candidateBoxes: [],
      imageSize: null,
    }
  );
}

async function tryMap(buffer: Buffer, mime: string, emit: Emit) {
  const providers = getProviders();
  emit({ stage: "analyzing", status: "active", detail: "reading text (OCR)" });
  let text = "";
  let confidence = 0;
  try {
    const r = await providers.vision.extractText(buffer, mime);
    text = r.text;
    confidence = r.confidence;
  } catch (e) {
    emit({ stage: "analyzing", status: "done", detail: `OCR failed: ${(e as Error).message}` });
    return null;
  }
  const { statement, candidates } = extractStatement(text);
  emit({ stage: "analyzing", status: "done", detail: statement ? "statement found" : "no statement" });
  if (!statement || statement.split(" ").length < 3) return null;
  emit({ stage: "validating", status: "active" });
  const analysis = await providers.text.analyzeStatement(statement);
  const row = await prisma.mAPStatement.create({
    data: {
      text: statement,
      lang: /[åäö]|\bjag\b/i.test(statement) ? "sv" : "en",
      domain: analysis.category,
      subscale: analysis.subscale,
      keyed: analysis.keyed,
      source: "ocr",
      interpretation: analysis.interpretation,
      behaviour: analysis.behaviour,
    },
  });
  emit({ stage: "validating", status: "done" });
  return { type: "map" as const, statementId: row.id, ocrText: text, ocrConfidence: confidence, candidates, analysis };
}
