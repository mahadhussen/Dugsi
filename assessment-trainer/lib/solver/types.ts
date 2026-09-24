import type { Cell } from "../matrigma/types";

export const STRATEGY_IDS = [
  "horizontal_transformation",
  "vertical_transformation",
  "diagonal_transformation",
  "rotation",
  "reflection",
  "translation",
  "object_count",
  "size_progression",
  "fill_progression",
  "orientation_progression",
  "shape_progression",
  "composition",
  "subtraction",
  "xor",
  "alternating_pattern",
  "two_rule_combination",
] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];

export interface ExplainedRule {
  text: string;
  attribute: string;
  kind: string;
  axis: string;
  complexity: number;
  validation: { label: string; ok: boolean }[];
  prediction?: string;
  /** True if the rule actually changes something (i.e. not "stays the same"). */
  informative: boolean;
}

export interface StrategyResult {
  id: StrategyId;
  label: string;
  applicable: boolean;
  rules: ExplainedRule[];
  optionScores: number[];
  complexity: number;
  validatedLines: number;
  predicted?: Cell | null;
  /** Did this strategy discriminate between options at all? */
  informative: boolean;
  topOptions: number[];
  weight: number;
  durationMs: number;
}

export interface Explanation {
  questionType: string;
  rules: string[];
  validation: string[];
  missingCell: string[];
  answer: string;
  confidence: string;
  notes: string[];
}

export interface Solution {
  status: "solved" | "uncertain" | "unsolved";
  answer: number | null;
  answerLabel: string | null;
  confidence: number;
  rawConfidence: number;
  strategy: string | null;
  validated: boolean;
  candidates: number[];
  optionScores: number[];
  strategies: StrategyResult[];
  rules: ExplainedRule[];
  predicted: Cell | null;
  confidenceFactors: Record<string, number>;
  explanation: Explanation;
  durationMs: number;
}
