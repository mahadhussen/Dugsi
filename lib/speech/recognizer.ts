// Free, on-device speech recognition using the browser's Web Speech API.
// No API key, no server, no per-use cost — the audio never leaves the device.
//
// The API recognises live (not record-then-send) and gives no word-level
// timestamps, so the experimental madd-timing feature is simply skipped for
// this engine. Accuracy on classical/Quranic Arabic is decent but not perfect.

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getCtor() !== null;
}

export interface RecognizerHandlers {
  /** Live transcript (committed + in-progress) for on-screen feedback. */
  onTranscript?: (text: string) => void;
  /** Fatal error (mic denied, not supported, ...). */
  onError?: (message: string) => void;
  /** Called once when recognition has fully stopped, with the final transcript. */
  onDone?: (finalText: string) => void;
}

/**
 * Wraps the Web Speech API for reciting a whole surah. The browser engine tends
 * to stop on silence, so while the user is still reciting we transparently
 * restart it and accumulate the committed text across sessions.
 */
export class Recognizer {
  private rec: SpeechRecognitionLike | null = null;
  private active = false;
  private committed = ""; // finalised text from previous sessions
  private sessionFinal = ""; // finalised text in the current session
  private handlers: RecognizerHandlers;

  constructor(handlers: RecognizerHandlers = {}) {
    this.handlers = handlers;
  }

  start(lang = "ar-SA"): void {
    const Ctor = getCtor();
    if (!Ctor) {
      this.handlers.onError?.("This browser doesn't support on-device speech recognition.");
      return;
    }
    this.active = true;
    this.committed = "";
    this.sessionFinal = "";
    this.spawn(Ctor, lang);
  }

  private spawn(Ctor: SpeechRecognitionCtor, lang: string): void {
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0].transcript;
        if (res.isFinal) final += text + " ";
        else interim += text;
      }
      this.sessionFinal = final;
      this.handlers.onTranscript?.((this.committed + final + interim).trim());
    };

    rec.onerror = (event) => {
      // "no-speech"/"aborted" are recoverable while the user is still reciting.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.active = false;
        this.handlers.onError?.("Microphone access was blocked. Please allow the mic and retry.");
      }
    };

    rec.onend = () => {
      // Commit whatever this session finalised.
      this.committed = (this.committed + this.sessionFinal).replace(/\s+/g, " ");
      this.sessionFinal = "";
      if (this.active) {
        // Browser stopped on a pause — keep listening.
        this.spawn(Ctor, lang);
      } else {
        this.handlers.onDone?.(this.committed.trim());
      }
    };

    this.rec = rec;
    try {
      rec.start();
    } catch {
      // start() can throw if called too quickly after a previous stop; ignore.
    }
  }

  stop(): void {
    this.active = false;
    this.rec?.stop();
  }

  cancel(): void {
    this.active = false;
    this.rec?.abort();
  }
}
