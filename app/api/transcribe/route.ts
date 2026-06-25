import { NextResponse } from "next/server";
import { getTranscriber } from "@/lib/transcribe";
import { analyzeRecitation } from "@/lib/analyze";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB cap on uploaded audio

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");

    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "No audio file was uploaded." }, { status: 400 });
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: "The recording was empty." }, { status: 400 });
    }
    if (audio.size > MAX_BYTES) {
      return NextResponse.json({ error: "Recording is too large." }, { status: 413 });
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const mimeType = audio.type || "audio/webm";

    const transcriber = getTranscriber();
    const result = await transcriber.transcribe(buffer, mimeType);

    if (!result.text.trim()) {
      return NextResponse.json(
        { error: "Could not hear any recitation. Please try again in a quiet place." },
        { status: 422 },
      );
    }

    const feedback = analyzeRecitation(result.text, result.words, result.engine);
    return NextResponse.json(feedback);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    const status = message.includes("OPENAI_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
