// Free, on-device Whisper transcription via transformers.js.
//
// transformers.js is loaded from a CDN at runtime (only when the user actually
// picks "High accuracy"), so it never bloats the bundle and the model weights
// are fetched/cached on the user's device. Nothing is sent to any server.
//
// Unlike the browser Web Speech engine, Whisper returns word-level timestamps,
// which powers the acoustic madd-timing feedback.

import { decodeToMono16k } from "@/lib/audio";
import type { TimedWord } from "@/lib/tajweed/timing";

// Pinned versions keep behaviour reproducible.
const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
// "tiny" + 8-bit quantisation keeps the model small (~40 MB) and light enough to
// run inside a phone browser without exhausting memory (whisper-base was OOM-ing
// on mobile). Live marking comes from the browser recogniser; Whisper refines.
const MODEL_ID = "Xenova/whisper-tiny";
const MODEL_DTYPE = "q8";

export interface WhisperProgress {
  stage: "loading-model" | "transcribing";
  /** 0..100 while downloading the model, undefined while transcribing. */
  percent?: number;
}

export interface WhisperResult {
  text: string;
  words: TimedWord[];
}

// transformers.js is an ESM module loaded by URL. The Function() indirection
// hides the dynamic import from the bundler so it stays a native browser import
// of the CDN URL (webpack would otherwise try to resolve/transform it).
async function loadTransformers(): Promise<any> {
  const importer = new Function("url", "return import(url)") as (u: string) => Promise<any>;
  return importer(TRANSFORMERS_CDN);
}

/** WebGPU is available on newer devices (incl. iOS 18+ Safari) and runs the
 *  model far more efficiently than WASM — the safe path to enable on iPhone. */
export function webgpuAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

let pipelinePromise: Promise<any> | null = null;

async function getPipeline(onProgress?: (p: WhisperProgress) => void): Promise<any> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const mod = await loadTransformers();
      const { pipeline, env } = mod;
      // Always fetch from the HF hub; we don't ship local weights.
      env.allowLocalModels = false;
      const gpu = webgpuAvailable();
      return pipeline("automatic-speech-recognition", MODEL_ID, {
        device: gpu ? "webgpu" : "wasm",
        dtype: gpu ? "fp16" : MODEL_DTYPE,
        progress_callback: (data: { status?: string; progress?: number }) => {
          if (data?.status === "progress" && typeof data.progress === "number") {
            onProgress?.({ stage: "loading-model", percent: Math.round(data.progress) });
          }
        },
      });
    })().catch((err) => {
      // Allow a later retry if loading failed.
      pipelinePromise = null;
      throw err;
    });
  }
  return pipelinePromise;
}

/** Preload the model (e.g. when the user switches to High accuracy mode). */
export async function warmUpWhisper(onProgress?: (p: WhisperProgress) => void): Promise<void> {
  await getPipeline(onProgress);
}

export async function transcribeWithWhisper(
  blob: Blob,
  onProgress?: (p: WhisperProgress) => void,
): Promise<WhisperResult> {
  const asr = await getPipeline(onProgress);
  const audio = await decodeToMono16k(blob);

  onProgress?.({ stage: "transcribing" });
  const output = await asr(audio, {
    language: "arabic",
    task: "transcribe",
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  const chunks: { text: string; timestamp: [number, number] }[] = output?.chunks ?? [];
  const words: TimedWord[] = chunks
    .filter((c) => c && Array.isArray(c.timestamp))
    .map((c) => ({
      word: (c.text ?? "").trim(),
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
    }))
    .filter((w) => w.word.length > 0);

  return { text: (output?.text ?? "").trim(), words };
}

export function isWhisperSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) !==
      "undefined"
  );
}
