// Dugsi's vowel worker: the Quran CTC model (lib/listen/vowel-model.ts), on
// the device. It only turns audio into per-frame letter scores (logits); the
// judging is plain arithmetic in lib/follow/vowel-judge.ts. Kept off the main
// thread so the page never stutters while the model works.
//
// Messages in:  { type: "load", config }       → "progress"* then "ready" | "failed"
//               { type: "logits", id, audio }  → "result" | "logits-failed"
// Audio is 16 kHz mono Float32Array (transferred).

let model = null;
let processor = null;
let loading = null;
let device = "wasm";

async function load(config) {
  const mod = await import(config.cdn);
  const { AutoModelForCTC, AutoProcessor, env } = mod;
  env.allowLocalModels = false;
  const progress_callback = (d) => {
    if (d && d.status === "progress" && typeof d.progress === "number") {
      self.postMessage({ type: "progress", file: d.file, percent: Math.round(d.progress) });
    }
  };
  processor = await AutoProcessor.from_pretrained(config.id, { revision: config.revision });
  if (config.webgpu && "gpu" in self.navigator) {
    try {
      model = await AutoModelForCTC.from_pretrained(config.id, {
        revision: config.revision,
        dtype: config.dtype,
        device: "webgpu",
        progress_callback,
      });
      device = "webgpu";
      return;
    } catch (err) {
      // No usable adapter, or the GPU path failed: fall through to WASM.
    }
  }
  model = await AutoModelForCTC.from_pretrained(config.id, {
    revision: config.revision,
    dtype: config.dtype,
    device: "wasm",
    progress_callback,
  });
  device = "wasm";
}

async function logits(audio) {
  const inputs = await processor(audio);
  const out = await model(inputs);
  const [, frames, vocab] = out.logits.dims;
  // A copy we own, so it can be transferred.
  return { frames, vocab, data: new Float32Array(out.logits.data) };
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "load") {
    if (!loading) loading = load(m.config);
    try {
      await loading;
      // Warm up once so the first real verse is not the slow one.
      const t = performance.now();
      await logits(new Float32Array(16000));
      self.postMessage({ type: "ready", device, warmupMs: Math.round(performance.now() - t) });
    } catch (err) {
      loading = null;
      self.postMessage({ type: "failed", message: String((err && err.message) || err) });
    }
    return;
  }
  if (m.type === "logits") {
    if (!model || !processor) {
      self.postMessage({ type: "logits-failed", id: m.id, message: "not loaded" });
      return;
    }
    const t = performance.now();
    try {
      const r = await logits(m.audio);
      self.postMessage({ type: "result", id: m.id, ...r, ms: Math.round(performance.now() - t) }, [r.data.buffer]);
    } catch (err) {
      self.postMessage({ type: "logits-failed", id: m.id, message: String((err && err.message) || err) });
    }
  }
};
