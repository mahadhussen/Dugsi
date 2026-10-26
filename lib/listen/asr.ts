// Talks to the listening worker (public/asr-worker.js). One worker for the
// whole page, so the model loads once and stays ready between recitations.

import { ASR_MODEL } from "./model";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type AsrStatus = "idle" | "loading" | "ready" | "failed";

export interface AsrResult {
  text: string;
  /** Times relative to the start of the decoded audio. */
  words: { text: string; start: number; end: number }[];
  ms: number;
}

type Listener = () => void;

class AsrClient {
  status: AsrStatus = "idle";
  percent = 0;
  device: "webgpu" | "wasm" | null = null;
  error: string | null = null;
  private worker: Worker | null = null;
  private loading: Promise<boolean> | null = null;
  private nextId = 1;
  private pending = new Map<number, (r: AsrResult | null) => void>();
  private listeners = new Set<Listener>();
  private fileProgress = new Map<string, number>();
  /** Settles the load in flight (with false when the model is let go). */
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
        w = new Worker(`${BASE}/asr-worker.js`, { type: "module" });
      } catch (e) {
        this.status = "failed";
        this.error = String(e);
        this.emit();
        resolve(false);
        return;
      }
      this.worker = w;
      w.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "progress") {
          if (m.file) this.fileProgress.set(m.file, m.percent);
          const vals = Array.from(this.fileProgress.values());
          // The two big graphs dominate the download; average what is in flight.
          this.percent = Math.round(vals.reduce((a, b) => a + b, 0) / Math.max(2, vals.length));
          this.emit();
        } else if (m.type === "ready") {
          this.status = "ready";
          this.device = m.device;
          this.percent = 100;
          this.emit();
          resolve(true);
        } else if (m.type === "failed") {
          this.status = "failed";
          this.error = m.message;
          this.loading = null;
          this.emit();
          resolve(false);
        } else if (m.type === "result" || m.type === "decode-failed") {
          const done = this.pending.get(m.id);
          this.pending.delete(m.id);
          done?.(m.type === "result" ? { text: m.text, words: m.words, ms: m.ms } : null);
        }
      };
      w.onerror = () => {
        this.status = "failed";
        this.error = "worker crashed";
        this.loading = null;
        for (const done of this.pending.values()) done(null);
        this.pending.clear();
        this.emit();
        resolve(false);
      };
      w.postMessage({
        type: "load",
        config: {
          cdn: ASR_MODEL.transformersCdn,
          id: ASR_MODEL.id,
          revision: ASR_MODEL.revision,
          encoderDtype: ASR_MODEL.encoderDtype,
          decoderDtype: ASR_MODEL.decoderDtype,
          webgpu: true,
        },
      });
    });
    return this.loading;
  }

  /**
   * Let go of the model and its worker, returning the memory (hundreds of MB
   * with the graphics chip). An iPhone kills a tab that holds too much, so
   * there the model is only kept while reciting. Loading again reads the
   * downloaded files from the cache.
   */
  unload(): void {
    if (!this.worker && this.status !== "loading") return;
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
    this.endLoading?.(false);
    this.endLoading = null;
    this.status = "idle";
    this.percent = 0;
    this.fileProgress.clear();
    for (const done of this.pending.values()) done(null);
    this.pending.clear();
    this.emit();
  }

  /** Decode 16 kHz audio. Null when the model is not available or failed. */
  decode(audio: Float32Array, words = true): Promise<AsrResult | null> {
    if (this.status !== "ready" || !this.worker) return Promise.resolve(null);
    const id = this.nextId++;
    const copy = audio.slice(); // the caller keeps its buffer
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker!.postMessage({ type: "decode", id, audio: copy, words }, [copy.buffer]);
    });
  }
}

export const asr = new AsrClient();
