import type { TimedWord } from "@/lib/tajweed/timing";

export interface TranscriptionResult {
  /** Full recognised Arabic text. */
  text: string;
  /** Word-level timings, when the engine provides them (else empty). */
  words: TimedWord[];
  /** Identifier of the engine that produced this result. */
  engine: string;
}

/**
 * A pluggable speech-to-text backend. Swap implementations (Whisper, a local
 * model, a browser engine, ...) without touching the alignment / tajweed code.
 */
export interface Transcriber {
  readonly name: string;
  transcribe(audio: Buffer, mimeType: string): Promise<TranscriptionResult>;
}
