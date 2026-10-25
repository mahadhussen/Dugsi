// Dugsi's listening worker: Tarteel's Quran model, on the device, one piece of
// recitation at a time. Kept off the main thread so the page never stutters
// while the model works. The model and its exact revision come from the page
// (lib/listen/model.ts) in the "load" message — one source of truth.
//
// Messages in:  { type: "load", config }            → "progress"* then "ready" | "failed"
//               { type: "decode", id, audio, words } → "result" | "decode-failed"
// Audio is 16 kHz mono Float32Array (transferred).

let asr = null;
let loading = null;
let device = "wasm";

async function load(config) {
  const mod = await import(config.cdn);
  const { pipeline, env } = mod;
  env.allowLocalModels = false;
  const progress_callback = (d) => {
    if (d && d.status === "progress" && typeof d.progress === "number") {
      self.postMessage({ type: "progress", file: d.file, percent: Math.round(d.progress) });
    }
  };
  const dtype = { encoder_model: config.encoderDtype, decoder_model_merged: config.decoderDtype };
  // The encoder is the heavy part and runs well on a GPU; the 8-bit decoder
  // stays on WASM (measured: 0.7 s per 6 s verse this way, 1.6 s all on WASM).
  if (config.webgpu && "gpu" in self.navigator) {
    try {
      const p = await pipeline("automatic-speech-recognition", config.id, {
        revision: config.revision,
        dtype,
        device: { encoder_model: "webgpu", decoder_model_merged: "wasm" },
        progress_callback,
      });
      device = "webgpu";
      return p;
    } catch (err) {
      // No usable adapter, or the GPU path failed: fall through to WASM.
    }
  }
  device = "wasm";
  return pipeline("automatic-speech-recognition", config.id, { revision: config.revision, dtype, device: "wasm", progress_callback });
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "load") {
    if (!loading) loading = load(m.config);
    try {
      asr = await loading;
      // Warm up once so the first real verse is not the slow one.
      const t = performance.now();
      await asr(new Float32Array(16000), { language: "arabic", task: "transcribe" });
      self.postMessage({ type: "ready", device, warmupMs: Math.round(performance.now() - t) });
    } catch (err) {
      loading = null;
      self.postMessage({ type: "failed", message: String((err && err.message) || err) });
    }
    return;
  }
  if (m.type === "decode") {
    if (!asr) {
      self.postMessage({ type: "decode-failed", id: m.id, message: "not loaded" });
      return;
    }
    const t = performance.now();
    try {
      const out = await asr(m.audio, { language: "arabic", task: "transcribe", return_timestamps: m.words ? "word" : false });
      const words = Array.isArray(out && out.chunks)
        ? out.chunks
            .filter((c) => c && Array.isArray(c.timestamp))
            .map((c) => ({ text: String(c.text || "").trim(), start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? c.timestamp[0] ?? 0 }))
            .filter((w) => w.text.length > 0)
        : [];
      self.postMessage({ type: "result", id: m.id, text: String((out && out.text) || "").trim(), words, ms: Math.round(performance.now() - t) });
    } catch (err) {
      self.postMessage({ type: "decode-failed", id: m.id, message: String((err && err.message) || err) });
    }
  }
};
