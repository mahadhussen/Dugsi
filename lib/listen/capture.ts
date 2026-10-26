// The microphone, as 16 kHz mono samples (what the Quran model hears), plus the
// same stream for the recording the reciter can play back.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Streaming resampler to 16 kHz. Averages the input over each output step
 * (a box filter, enough against aliasing for speech) and interpolates the
 * position, so any device rate — 44.1, 48, 96 kHz — comes out right.
 * Pure: the same input in any chunk sizes gives the same output.
 */
export class Resampler {
  private readonly step: number;
  private pos = 0; // fractional input position of the next output sample, relative to the carry start
  private carry: Float32Array = new Float32Array(0);

  constructor(
    readonly fromRate: number,
    readonly toRate = 16000,
  ) {
    this.step = fromRate / toRate;
  }

  push(input: Float32Array): Float32Array {
    if (this.fromRate === this.toRate) return input.slice();
    const buf = new Float32Array(this.carry.length + input.length);
    buf.set(this.carry);
    buf.set(input, this.carry.length);
    const out: number[] = [];
    const half = this.step / 2;
    while (this.pos + half + 1 < buf.length) {
      const a = Math.max(0, Math.floor(this.pos - half));
      const b = Math.min(buf.length - 1, Math.ceil(this.pos + half));
      let s = 0;
      for (let i = a; i <= b; i++) s += buf[i];
      out.push(s / (b - a + 1));
      this.pos += this.step;
    }
    const keepFrom = Math.max(0, Math.floor(this.pos - half) - 1);
    this.carry = buf.slice(keepFrom);
    this.pos -= keepFrom;
    return Float32Array.from(out);
  }
}

export interface Mic {
  stream: MediaStream;
  /** The device's own rate (the recording keeps it). */
  sampleRate: number;
  stop(): void;
}

/** The microphone was allowed, but audio processing could not start here. */
export class CaptureUnavailable extends Error {}

/**
 * Open the microphone and deliver 16 kHz samples to `onSamples`. Must be
 * called from a tap on iOS (the audio context starts suspended otherwise).
 */
export async function openMic(onSamples: (pcm: Float32Array) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  try {
    return await wire(stream, onSamples);
  } catch (e) {
    // The microphone was granted but audio processing could not start: let go
    // of the microphone, and say it was not the permission.
    stream.getTracks().forEach((t) => t.stop());
    throw new CaptureUnavailable(String(e));
  }
}

async function wire(stream: MediaStream, onSamples: (pcm: Float32Array) => void): Promise<Mic> {
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
  const src = ctx.createMediaStreamSource(stream);
  const resampler = new Resampler(ctx.sampleRate);
  const sink = ctx.createGain();
  sink.gain.value = 0; // processing must be pulled by the graph, but nothing is heard
  sink.connect(ctx.destination);

  let node: AudioNode;
  if (ctx.audioWorklet && typeof AudioWorkletNode !== "undefined") {
    await ctx.audioWorklet.addModule(`${BASE}/capture-worklet.js`);
    const w = new AudioWorkletNode(ctx, "dugsi-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
    w.port.onmessage = (e: MessageEvent<Float32Array>) => onSamples(resampler.push(e.data));
    node = w;
  } else {
    // Old Safari: the deprecated processor still works.
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    sp.onaudioprocess = (e) => onSamples(resampler.push(new Float32Array(e.inputBuffer.getChannelData(0))));
    node = sp;
  }
  src.connect(node);
  node.connect(sink);

  return {
    stream,
    sampleRate: ctx.sampleRate,
    stop() {
      try {
        src.disconnect();
        node.disconnect();
      } catch {
        /* already disconnected */
      }
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => undefined);
    },
  };
}
