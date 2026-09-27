// Voice activity detection with Silero VAD (MIT), via @ricky0123/vad-web (ISC)
// and onnxruntime-web (MIT). All three load from a CDN at runtime, only when a
// recitation starts, so they never bloat the bundle; the tiny (~2 MB) model runs
// fully on the device and the audio never leaves it.
//
// What Dugsi uses it for:
//   - hesitations: a silence longer than HESITATION_MS in the middle of a
//     recitation is a memorisation weak spot — we note WHEN it happened so the
//     results can say "you paused before verse 4";
//   - optional auto-stop after a long silence at the end.
//
// Everything is best-effort: if the CDN is unreachable or the worklet cannot
// start (old browsers, strict CSP), reciting works exactly as before.

const ORT_VERSION = "1.22.0";
const VAD_VERSION = "0.0.31";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const VAD_BASE = `https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@${VAD_VERSION}/dist/`;

export const HESITATION_MS = 2500;

export interface VadHandlers {
  onSpeechStart?: (tSec: number) => void;
  /** Speech ended at tSec (recording clock) after `durationMs` of speech. */
  onSpeechEnd?: (tSec: number, durationMs: number) => void;
  /** Silence since the last speech has now lasted `ms` (called once per threshold crossing). */
  onSilence?: (ms: number, tSec: number) => void;
}

export interface VadHandle {
  stop: () => void;
}

interface MicVADLike {
  start(): void;
  pause(): void;
  destroy?: () => void;
}

interface VadGlobal {
  MicVAD: {
    new: (opts: Record<string, unknown>) => Promise<MicVADLike>;
  };
}

let scriptsPromise: Promise<VadGlobal | null> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.getAttribute("data-loaded") === "1") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load failed")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => {
      s.setAttribute("data-loaded", "1");
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Load the CDN bundles once; null when they cannot be loaded here. */
async function loadVad(): Promise<VadGlobal | null> {
  if (typeof window === "undefined") return null;
  if (!scriptsPromise) {
    scriptsPromise = (async () => {
      try {
        await loadScript(`${ORT_BASE}ort.wasm.min.js`);
        await loadScript(`${VAD_BASE}bundle.min.js`);
        const g = (window as unknown as { vad?: VadGlobal }).vad;
        return g && g.MicVAD ? g : null;
      } catch {
        return null;
      }
    })();
  }
  return scriptsPromise;
}

/** Whether VAD can even be attempted here (AudioWorklet + wasm). */
export function vadSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    typeof WebAssembly !== "undefined"
  );
}

/**
 * Start watching an existing microphone stream. `clock()` must return seconds
 * on the recording clock so events line up with the live word timestamps.
 * Resolves to a handle (or null if VAD is unavailable — reciting continues).
 */
export async function startVad(
  stream: MediaStream,
  clock: () => number,
  handlers: VadHandlers,
  silenceStepsMs: number[] = [HESITATION_MS],
): Promise<VadHandle | null> {
  if (!vadSupported()) return null;
  const g = await loadVad();
  if (!g) return null;

  let speaking = false;
  let speechStartedAt = 0;
  let lastSpeechEnd = -1;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const clearSilence = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = null;
  };
  // Fire onSilence at each configured threshold after speech stops.
  const armSilence = () => {
    clearSilence();
    const steps = [...silenceStepsMs].sort((a, b) => a - b);
    const started = Date.now();
    let k = 0;
    const tick = () => {
      if (stopped || k >= steps.length) return;
      const wait = Math.max(0, steps[k] - (Date.now() - started));
      silenceTimer = setTimeout(() => {
        if (stopped || speaking) return;
        handlers.onSilence?.(steps[k], clock());
        k++;
        tick();
      }, wait);
    };
    tick();
  };

  try {
    const vad = await g.MicVAD.new({
      // Reuse Dugsi's own mic stream — never open a second one.
      getStream: async () => stream,
      pauseStream: async () => {},
      resumeStream: async () => stream,
      model: "v5",
      onnxWASMBasePath: ORT_BASE,
      baseAssetPath: VAD_BASE,
      // A recitation has natural short pauses between words; only a real gap ends
      // a segment (redemption), and stray noise shorter than minSpeech is ignored.
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      redemptionMs: 600,
      minSpeechMs: 250,
      preSpeechPadMs: 200,
      onSpeechStart: () => {
        if (stopped) return;
        speaking = true;
        speechStartedAt = clock();
        clearSilence();
        handlers.onSpeechStart?.(speechStartedAt);
      },
      onVADMisfire: () => {
        speaking = false;
        if (lastSpeechEnd >= 0) armSilence();
      },
      onSpeechEnd: () => {
        if (stopped) return;
        speaking = false;
        const now = clock();
        lastSpeechEnd = now;
        handlers.onSpeechEnd?.(now, Math.max(0, (now - speechStartedAt) * 1000));
        armSilence();
      },
    });
    vad.start();
    return {
      stop: () => {
        stopped = true;
        clearSilence();
        try {
          vad.pause();
          vad.destroy?.();
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return null;
  }
}

/** A pause the reciter took mid-recitation, with where they were. */
export interface Hesitation {
  /** Seconds into the recording when the silence began. */
  at: number;
  /** Length of the pause in seconds. */
  seconds: number;
  /** Reference index of the next word expected when the pause began. */
  beforeRefIndex: number;
}
