// Free, on-device Whisper transcription via transformers.js.
//
// transformers.js is loaded from a CDN at runtime (only when a recitation is
// refined), so it never bloats the bundle and the model weights are fetched and
// cached on the user's device. Nothing is sent to any server.
//
// Two models, both open:
//   - Quran-tuned: Tarteel's whisper-base-ar-quran (Apache-2.0), fine-tuned on
//     Quranic recitation (reported WER ≈ 5.8% vs. ~30%+ for general Arabic
//     Whisper on recitation). Used through its ONNX export for transformers.js.
//     It is a "base"-size model, so it is only attempted on devices that can
//     take it (WebGPU, or a non-iOS browser); elsewhere, and if it ever fails
//     to load, we fall back to…
//   - General: whisper-tiny (MIT), ~40 MB quantised, runs on almost anything.
//
// Unlike the browser Web Speech engine, Whisper returns word-level timestamps,
// which powers the acoustic madd-timing feedback and the per-word "You" clips.

import { decodeToMono16k } from "@/lib/audio";
import type { TimedWord } from "@/lib/tajweed/timing";

// Pinned versions keep behaviour reproducible.
const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";

export interface WhisperModel {
  id: string;
  /** Hugging Face repo with an ONNX export in the transformers.js layout. */
  hfId: string;
  label: string;
  /** Rough download size of the quantised weights, for the status line. */
  approxMb: number;
  /** Heavier models are only tried where the device can take them. */
  heavy: boolean;
}

export const QURAN_MODEL: WhisperModel = {
  id: "quran",
  hfId: "YunusZJ/whisper-base-ar-quran-ONNX",
  label: "Quran-tuned (Tarteel whisper-base-ar-quran)",
  approxMb: 80,
  heavy: true,
};

export const GENERAL_MODEL: WhisperModel = {
  id: "general",
  hfId: "Xenova/whisper-tiny",
  label: "General Arabic (whisper-tiny)",
  approxMb: 40,
  heavy: false,
};

const MODEL_DTYPE = "q8";
// Remember a model that failed to load here so we don't retry it every time
// (the fallback still runs). Cleared after a week — the CDN may have been down.
const FAILED_KEY = "dugsi:whisper:failed";
const FAILED_TTL = 7 * 86_400_000;

function modelFailedRecently(hfId: string): boolean {
  try {
    const raw = localStorage.getItem(FAILED_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, number>;
    return typeof map[hfId] === "number" && Date.now() - map[hfId] < FAILED_TTL;
  } catch {
    return false;
  }
}
function markModelFailed(hfId: string): void {
  try {
    const raw = localStorage.getItem(FAILED_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[hfId] = Date.now();
    localStorage.setItem(FAILED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export interface WhisperProgress {
  stage: "loading-model" | "transcribing";
  /** 0..100 while downloading the model, undefined while transcribing. */
  percent?: number;
  /** Which model is being loaded / used. */
  model?: WhisperModel;
}

export interface WhisperResult {
  text: string;
  words: TimedWord[];
  /** The model that produced this result. */
  model: WhisperModel;
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

function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iP(hone|ad|od)/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** Which model to try first on this device. `preferQuran` = the user's setting. */
export function pickWhisperModel(preferQuran: boolean): WhisperModel {
  if (!preferQuran) return GENERAL_MODEL;
  if (modelFailedRecently(QURAN_MODEL.hfId)) return GENERAL_MODEL;
  // The base-size model is what memory-killed older phones before; only try it
  // where there is headroom (WebGPU, or a desktop/Android browser).
  if (QURAN_MODEL.heavy && isIOSDevice() && !webgpuAvailable()) return GENERAL_MODEL;
  return QURAN_MODEL;
}

const pipelines = new Map<string, Promise<any>>();

async function getPipeline(model: WhisperModel, onProgress?: (p: WhisperProgress) => void): Promise<any> {
  let p = pipelines.get(model.hfId);
  if (!p) {
    p = (async () => {
      const mod = await loadTransformers();
      const { pipeline, env } = mod;
      // Always fetch from the HF hub; we don't ship local weights.
      env.allowLocalModels = false;
      const gpu = webgpuAvailable();
      return pipeline("automatic-speech-recognition", model.hfId, {
        device: gpu ? "webgpu" : "wasm",
        dtype: gpu ? "fp16" : MODEL_DTYPE,
        progress_callback: (data: { status?: string; progress?: number }) => {
          if (data?.status === "progress" && typeof data.progress === "number") {
            onProgress?.({ stage: "loading-model", percent: Math.round(data.progress), model });
          }
        },
      });
    })().catch((err) => {
      // Allow a later retry if loading failed.
      pipelines.delete(model.hfId);
      throw err;
    });
    pipelines.set(model.hfId, p);
  }
  return p;
}

/** Preload a model (e.g. while the reciter is still reading). */
export async function warmUpWhisper(model: WhisperModel, onProgress?: (p: WhisperProgress) => void): Promise<void> {
  await getPipeline(model, onProgress);
}

/**
 * Transcribe a recording. Tries `preferred` first; if that model cannot be
 * loaded (CDN/hub down, unsupported export, out of memory while loading) it
 * is remembered as failed for a while and the general model is used instead,
 * so the reciter always gets a result.
 */
export async function transcribeWithWhisper(
  blob: Blob,
  onProgress?: (p: WhisperProgress) => void,
  preferred: WhisperModel = GENERAL_MODEL,
): Promise<WhisperResult> {
  let model = preferred;
  let asr: any;
  try {
    asr = await getPipeline(model, onProgress);
  } catch (err) {
    if (model.hfId === GENERAL_MODEL.hfId) throw err;
    markModelFailed(model.hfId);
    model = GENERAL_MODEL;
    asr = await getPipeline(model, onProgress);
  }
  const audio = await decodeToMono16k(blob);

  onProgress?.({ stage: "transcribing", model });
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

  return { text: (output?.text ?? "").trim(), words, model };
}

export function isWhisperSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) !==
      "undefined"
  );
}
