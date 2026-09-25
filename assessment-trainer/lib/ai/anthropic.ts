import Anthropic from "@anthropic-ai/sdk";
import type { ReasoningProvider, TextProvider, VisionProvider } from "./types";
import type { VisionResult } from "../vision/types";
import { SUBSCALES } from "../map/model";
import { describe, analyzeStatement as localAnalyze } from "../map/classify";
import { analyzeMatrixLocal } from "../vision/local";

/**
 * Anthropic (Claude) providers. Used only when configured via env and an API
 * key is present. Images are sent only for OCR (MAP statements); Matrigma
 * matrices are always read by the local OpenCV pipeline and solved locally.
 */
const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-opus-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

type ImageMime = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

async function jsonCall<T>(content: Anthropic.Beta.BetaContentBlockParam[], schema: Record<string, unknown>): Promise<T> {
  const response = await getClient().beta.messages.create({
    model: MODEL(),
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
  return JSON.parse(text) as T;
}

export const anthropicVision: VisionProvider = {
  name: `anthropic (${MODEL()}) for OCR, OpenCV for matrices`,
  async extractMatrix(image): Promise<VisionResult> {
    // Matrix extraction stays local: visual verification beats model intuition.
    return analyzeMatrixLocal(image);
  },
  async extractText(image, mime) {
    const out = await jsonCall<{ text: string }>(
      [
        { type: "image", source: { type: "base64", media_type: mime as ImageMime, data: image.toString("base64") } },
        { type: "text", text: "Transcribe all text visible in this screenshot, line by line, exactly as written. Do not add anything." },
      ],
      { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    );
    return { text: out.text, confidence: 0.9 };
  },
};

export const anthropicText: TextProvider = {
  name: `anthropic (${MODEL()})`,
  async analyzeStatement(statement) {
    const keys = SUBSCALES.map((s) => `${s.key}: ${s.name} (${s.domain})`).join("\n");
    try {
      const out = await jsonCall<{ subscale: string; keyed: number; confidence: number }>(
        [
          {
            type: "text",
            text:
              `Classify this personality-questionnaire practice statement into exactly one facet and say whether agreeing expresses ` +
              `more (+1) or less (-1) of that facet. Do not judge which answer is better.\n\nFacets:\n${keys}\n\nStatement: "${statement}"`,
          },
        ],
        {
          type: "object",
          properties: { subscale: { type: "string", enum: SUBSCALES.map((s) => s.key) }, keyed: { type: "integer", enum: [1, -1] }, confidence: { type: "number" } },
          required: ["subscale", "keyed", "confidence"],
          additionalProperties: false,
        },
      );
      const sub = SUBSCALES.find((s) => s.key === out.subscale);
      if (!sub) return localAnalyze(statement);
      return describe(statement, sub, out.keyed === -1 ? -1 : 1, Math.max(0, Math.min(1, out.confidence)), "ai");
    } catch {
      return localAnalyze(statement);
    }
  },
};

export const anthropicReasoning: ReasoningProvider = {
  name: `anthropic (${MODEL()})`,
  async explain(_problem, solution) {
    if (solution.answer === null) return null;
    const ex = solution.explanation;
    const out = await jsonCall<{ text: string }>(
      [
        {
          type: "text",
          text:
            `Rewrite this verified matrix-puzzle explanation as a short, friendly teaching paragraph (max 80 words). ` +
            `Do not change the answer or add rules.\nRules: ${ex.rules.join(" ")}\nValidation: ${ex.validation.join(", ")}\nAnswer: ${ex.answer}`,
        },
      ],
      { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
    );
    return out.text;
  },
};
