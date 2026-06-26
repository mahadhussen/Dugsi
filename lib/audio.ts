// Decode a recorded audio Blob into the mono 16 kHz Float32 PCM that Whisper
// expects. Uses the Web Audio API entirely on-device.

export async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const arrayBuf = await blob.arrayBuffer();

  const AudioCtx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuf);
  } finally {
    void ctx.close();
  }

  const targetRate = 16000;
  const frames = Math.max(1, Math.ceil(decoded.duration * targetRate));
  const offline = new OfflineAudioContext(1, frames, targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
