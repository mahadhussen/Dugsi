import type { MatrixProblem } from "../matrigma/types";
import type { StatementAnalysis } from "../map/classify";
import type { Solution } from "../solver/types";
import type { VisionResult } from "../vision/types";

/**
 * Provider interfaces. The rest of the system depends only on these, so an AI
 * provider can be swapped (local, Anthropic, …) without other changes.
 *
 * Design rule: whenever the local pipeline can read a matrix, the answer is
 * decided by the verified solver; AI providers may only help *read* an image or
 * *phrase* an explanation. For layouts it cannot read, an optional Claude
 * reading (./matrix-reading.ts) is shown, labelled as unverified, and it
 * abstains unless exactly one option fits with enough confidence.
 */
export interface VisionProvider {
  readonly name: string;
  /** Detect matrix, cells, options and objects. */
  extractMatrix(image: Buffer, mime: string): Promise<VisionResult>;
  /** OCR: plain text from a screenshot (for MAP statements). */
  extractText(image: Buffer, mime: string): Promise<{ text: string; confidence: number }>;
}

export interface TextProvider {
  readonly name: string;
  /** Explain what a personality statement is about. */
  analyzeStatement(statement: string): Promise<StatementAnalysis>;
}

export interface ReasoningProvider {
  readonly name: string;
  /** Optional plain-language rewrite of a verified explanation. Must not change the answer. */
  explain(problem: MatrixProblem, solution: Solution): Promise<string | null>;
}

export interface Providers {
  vision: VisionProvider;
  text: TextProvider;
  reasoning: ReasoningProvider;
}
