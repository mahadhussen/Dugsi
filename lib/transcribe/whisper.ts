import OpenAI from "openai";
import { toFile } from "openai/uploads";
import type { TranscriptionResult, Transcriber } from "./types";
import type { TimedWord } from "@/lib/tajweed/timing";

const extForMime: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/m4a": "m4a",
};

/**
 * OpenAI Whisper transcriber. Requests verbose JSON with word-level timestamps
 * so the tajweed timing engine can estimate elongations.
 */
export class WhisperTranscriber implements Transcriber {
  readonly name = "whisper-1";
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(audio: Buffer, mimeType: string): Promise<TranscriptionResult> {
    const ext = extForMime[mimeType.split(";")[0]] ?? "webm";
    const file = await toFile(audio, `recitation.${ext}`, { type: mimeType });

    const res = (await this.client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "ar",
      response_format: "verbose_json",
      // Bias the model toward Quranic Arabic.
      prompt: "تلاوة القرآن الكريم سورة الفاتحة",
      timestamp_granularities: ["word"],
    })) as unknown as { text: string; words?: { word: string; start: number; end: number }[] };

    const words: TimedWord[] = (res.words ?? []).map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    return { text: res.text ?? "", words, engine: this.name };
  }
}
