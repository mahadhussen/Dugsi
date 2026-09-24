import type { Providers } from "./types";
import { localReasoning, localText, localVision } from "./local";
import { anthropicReasoning, anthropicText, anthropicVision } from "./anthropic";

export type { Providers, VisionProvider, TextProvider, ReasoningProvider } from "./types";

function useAnthropic(kind: "VISION" | "TEXT" | "REASONING"): boolean {
  return process.env[`${kind}_PROVIDER`] === "anthropic" && !!process.env.ANTHROPIC_API_KEY;
}

/** Resolve providers from environment variables (see .env.example). */
export function getProviders(): Providers {
  return {
    vision: useAnthropic("VISION") ? anthropicVision : localVision,
    text: useAnthropic("TEXT") ? anthropicText : localText,
    reasoning: useAnthropic("REASONING") ? anthropicReasoning : localReasoning,
  };
}

export function providerSummary() {
  const p = getProviders();
  return { vision: p.vision.name, text: p.text.name, reasoning: p.reasoning.name };
}
