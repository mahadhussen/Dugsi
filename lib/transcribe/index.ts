import type { Transcriber } from "./types";
import { WhisperTranscriber } from "./whisper";

export type { Transcriber, TranscriptionResult } from "./types";

/**
 * Select the active transcription engine. Whisper is the default; the indirection
 * here is the seam for swapping in other backends later (local model, etc.)
 * without changing any caller.
 */
export function getTranscriber(): Transcriber {
  const engine = (process.env.DUGSI_TRANSCRIBER ?? "whisper").toLowerCase();

  switch (engine) {
    case "whisper":
    default: {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY is not set. Add it to .env.local to use the Whisper transcriber.",
        );
      }
      return new WhisperTranscriber(apiKey);
    }
  }
}
