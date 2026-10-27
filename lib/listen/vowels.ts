// Talks to the vowel worker (public/vowel-worker.js). One worker for the whole
// page, so the model loads once and stays ready between recitations.

import { logSoftmax, type LogProbs } from "@/lib/follow/ctc";
import { ASR_MODEL } from "./model";
import { VOWEL_MODEL } from "./vowel-model";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type VowelStatus = "idle" | "loading" | "ready" | "failed";

type Listener = () => void;

class VowelClient {
  status: VowelStatus = "idle";
  percent = 0;
  device: "webgpu" | "wasm" | null = null;
  error: string | null = null;
  /** Milliseconds of work per millisecond of audio, last run. */
  speed: number | null = null;
  private worker: Worker | null = null;
  private loading: Promise<boolean> | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: LogProbs | null) => void>();
  private listeners = new Set<Listener>();
  private endLoading: ((ok: boolean) => void) | null = null;

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  supported(): boolean {
    return typeof window !== "undefined" && typeof Worker !== "undefined";
  }

  /** Start loading the model (idempotent). Resolves true when ready. */
  load(): Promise<boolean> {
    if (this.status === "ready") return Promise.resolve(true);
    if (this.loading) return this.loading;
    if (!this.supported()) {
      this.status = "failed";
      this.error = "no workers";
      this.emit();
      return Promise.resolve(false);
    }
    this.status = "loading";
    this.percent = 0;
    this.emit();
    this.loading = new Promise<boolean>((resolve) => {
      this.endLoading = resolve;
      let w: Worker;
      try {
        w = new Worker(`${BASE}/vowel-worker.js`, { type: "module" });
      } catch (e) {
        this.fail(String(e));
        resolve(false);
        return;
      }
      this.worker = w;
      w.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "progress") {
          // One big graph: its progress is the download's.
          if (typeof m.file === "string" && m.file.endsWith(".onnx")) this.percent = m.percent;
          this.emit();
        } else if (m.type === "ready") {
          this.status = "ready";
          this.device = m.device;
          this.percent = 100;
          this.emit();
          resolve(true);
        } else if (m.type === "failed") {
          this.fail(m.message);
          resolve(false);
        } else if (m.type === "result" || m.type === "logits-failed") {
          const done = this.pending.get(m.id);
          this.pending.delete(m.id);
          if (m.type === "result") {
            this.speed = m.ms / Math.max(1, (m.frames * 20));
            done?.(logSoftmax(m.data as Float32Array, m.frames, m.vocab));
          } else done?.(null);
        }
      };
      w.onerror = () => {
        this.fail("worker crashed");
        for (const done of this.pending.values()) done(null);
        this.pending.clear();
        resolve(false);
      };
      w.postMessage({
        type: "load",
        config: {
          cdn: ASR_MODEL.transformersCdn,
          id: VOWEL_MODEL.id,
          revision: VOWEL_MODEL.revision,
          dtype: VOWEL_MODEL.dtype,
          webgpu: true,
        },
      });
    });
    return this.loading;
  }

  private fail(message: string) {
    this.status = "failed";
    this.error = message;
    this.loading = null;
    this.worker?.terminate();
    this.worker = null;
    this.emit();
  }

  /** Let go of the model and its worker, returning the memory. */
  unload(): void {
    if (!this.worker && this.status !== "loading") return;
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
    this.endLoading?.(false);
    this.endLoading = null;
    this.status = "idle";
    this.percent = 0;
    for (const done of this.pending.values()) done(null);
    this.pending.clear();
    this.emit();
  }

  /** Per-frame log-probabilities of 16 kHz audio, or null. */
  logProbs(audio: Float32Array): Promise<LogProbs | null> {
    if (this.status !== "ready" || !this.worker) return Promise.resolve(null);
    const id = this.nextId++;
    const copy = audio.slice(); // the caller keeps its buffer
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ type: "logits", id, audio: copy }, [copy.buffer]);
    });
  }
}

export const vowels = new VowelClient();
