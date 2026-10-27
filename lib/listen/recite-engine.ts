// The recitation pipeline: microphone → pieces at the pauses → Tarteel's Quran
// model on the device → the follower. The service layer between the Reciter
// screen (when and why) and the pure follower (what is true).
//
// Explicit phases: idle → starting → listening → finishing → done | error.
// Every async step checks that its session is still the current one, so a
// stop, a second start or a surah change mid-way can never mix two attempts.
//
// When the model cannot run (no worker, failed download, switched off) the
// browser's own recogniser stands in as before: its final results become the
// pieces, with the same confidence gate, and the screen says which is used.
//
// Vowels: when a second model, the vowel model, is given its words
// (opts.vowelWords) and is ready, every piece the follower placed is scored
// by it too, after the listening model, and only it judges vowels.

import type { Word } from "@/lib/quran/types";
import { Recognizer, isSpeechSupported } from "@/lib/speech/recognizer";
import { pickBestAlternative } from "@/lib/speech/pickBest";
import { applyHint, applyPiece, createFollower, fitScore, type CtcVowel, type FollowState, type PieceInput } from "@/lib/follow/follower";
import type { RefText } from "@/lib/follow/text";
import { verdictOf, type Verdict } from "@/lib/follow/verdict";
import { tokenize } from "@/lib/arabic";
import { asr } from "./asr";
import { CaptureUnavailable, openMic, type Mic } from "./capture";
import { isJoinCandidate, preferJoined } from "./policy";
import { Segmenter, type Segment } from "./segmenter";
import { vowels } from "./vowels";
import { pieceVowelWords, vowelsOfPiece } from "./vowel-pass";

const SR = 16000;
export const HESITATION_MS = 2500;
const RING_SECONDS = 30; // audio kept for joined re-decodes
const QUEUE_LIMIT_SECONDS = 300; // pieces kept while the model is still downloading

export type EnginePhase = "idle" | "starting" | "listening" | "finishing" | "done" | "error";
export type JudgeMode = "model" | "browser" | "none";

export interface Hesitation {
  /** Recording time the pause began, seconds. */
  at: number;
  seconds: number;
  /** The word the reciter was stuck before (resolved when the attempt ends). */
  beforeRefIndex: number;
}

export interface EngineSnapshot {
  phase: EnginePhase;
  follow: FollowState;
  mode: JudgeMode;
  model: { status: typeof asr.status; percent: number; device: typeof asr.device };
  /** The vowel model, when this attempt uses one. */
  vowelModel: { status: typeof vowels.status; percent: number; device: typeof vowels.device } | null;
  /** Pieces still waiting for the model. */
  waiting: number;
  /** The last words heard, for the line under the mic. */
  heard: string;
  /** Words heard that belong nowhere in the text, so far. */
  extras: number;
  seconds: number;
  error: "mic-denied" | "unsupported" | null;
}

export interface EngineResult {
  verdict: Verdict;
  recording: Blob | null;
  hesitations: Hesitation[];
  seconds: number;
  mode: JudgeMode;
  /** The model was still downloading when the reciter stopped (first use). */
  modelPending: boolean;
}

export interface EngineOptions {
  ref: RefText;
  range?: { start: number; end: number };
  /** Word to start following from (reciting from a verse mid-surah). */
  from?: number;
  words: Word[];
  /** Use the Quran model (the user can switch it off). */
  useModel: boolean;
  /** The vowel model's spelling of each reference word (lib/quran/ctc-text):
   *  given, the vowel model judges vowels once it is ready. */
  vowelWords?: readonly string[];
  /** Stop by itself after this much silence (ms), or null. */
  autoStopMs: number | null;
  onUpdate: (s: EngineSnapshot) => void;
  onAutoStop?: () => void;
}

interface Job {
  kind: "piece" | "join" | "partial";
  audio: Float32Array;
  t0: number;
  seg?: Segment;
  a?: PieceInput;
  b?: PieceInput;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

export class ReciteEngine {
  private phase: EnginePhase = "idle";
  private follow: FollowState;
  private before = new Map<number, FollowState>(); // follower state before each piece id
  private segmenter = new Segmenter({ silenceMarks: [HESITATION_MS] });
  private mic: Mic | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recognizer: Recognizer | null = null;
  private browserFinals: { t: number; text: string }[] = [];
  private hintText = "";
  private ring = new Float32Array(RING_SECONDS * SR);
  private ringEnd = 0; // total samples written (recording clock)
  private queue: Job[] = [];
  private busy = false;
  private lastPartialAt = 0;
  private lastSpeed = 1; // decode ms per audio ms, last piece
  private timed = false; // a piece has been decoded and timed
  private hesitations: Hesitation[] = [];
  private started = 0;
  private session = 0;
  private error: EngineSnapshot["error"] = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private unsub: (() => void) | null = null;
  private lastPieceInput: PieceInput | null = null;
  private idleWaiters: (() => void)[] = [];
  private starting: Promise<boolean> | null = null;
  /** This attempt is judged by the browser after all (model not ready at stop). */
  private browserJudges = false;
  private modelPending = false;
  private stoppedAt = 0;
  // The vowel model's work: pieces waiting (their audio), and its findings
  // per piece. Runs only while the listening model has nothing to do.
  private vowelJobs: { inputId: number; audio: Float32Array }[] = [];
  private vowelBusy = false;
  private vowelBook = new Map<number, ReadonlyMap<number, CtcVowel>>();
  private vowelWaiters: (() => void)[] = [];
  private vowelUnsub: (() => void) | null = null;
  private lastSegEnd = 0; // seconds, end of the last closed piece
  private segmentsClosed = 0;

  constructor(private readonly opts: EngineOptions) {
    this.follow = createFollower(opts.ref, opts.range, opts.from);
  }

  get mode(): JudgeMode {
    if (!this.browserJudges && this.opts.useModel && asr.status !== "failed" && asr.supported()) return "model";
    return isSpeechSupported() ? "browser" : "none";
  }

  snapshot(): EngineSnapshot {
    const pieceWords = this.follow.pieces.flatMap((p) => p.input.text.split(/\s+/).filter(Boolean));
    const tail = [...pieceWords.slice(-10), ...this.hintText.split(/\s+/).filter(Boolean).slice(-4)];
    return {
      phase: this.phase,
      follow: this.follow,
      mode: this.mode,
      model: { status: asr.status, percent: asr.percent, device: asr.device },
      vowelModel: this.opts.vowelWords ? { status: vowels.status, percent: vowels.percent, device: vowels.device } : null,
      waiting: this.queue.filter((j) => j.kind !== "partial").length + (this.busy ? 1 : 0),
      heard: tail.slice(-12).join(" "),
      extras: this.follow.pieces.reduce(
        (n, p) => n + (p.align ? p.align.extras.filter((e) => e > 0 && e < p.tokens.length - 1).length : 0),
        0,
      ),
      seconds: this.started ? (Date.now() - this.started) / 1000 : 0,
      error: this.error,
    };
  }

  private emit() {
    this.opts.onUpdate(this.snapshot());
  }

  /** Begin listening. Call from a tap (iOS needs the gesture for audio). */
  start(): Promise<boolean> {
    if (this.phase !== "idle") return Promise.resolve(false);
    this.starting = this.doStart();
    return this.starting;
  }

  private async doStart(): Promise<boolean> {
    const my = ++this.session;
    this.phase = "starting";
    this.emit();
    if (this.opts.useModel) void asr.load().then(() => {
      if (this.session === my) void this.pump();
    });
    if (this.opts.vowelWords && vowels.supported()) {
      void vowels.load();
      this.vowelUnsub = vowels.subscribe(() => {
        if (this.session !== my) return;
        if (vowels.status === "ready") this.vowelsOn();
        this.emit();
        void this.pumpVowels();
      });
      if (vowels.status === "ready") this.vowelsOn();
    }
    this.unsub = asr.subscribe(() => {
      if (this.session !== my) return;
      if (asr.status === "failed") this.fallBackToBrowser();
      // The model is ready: from now on nothing leaves the device.
      if (asr.status === "ready" && this.mode === "model" && this.recognizer) {
        this.recognizer.cancel();
        this.recognizer = null;
      }
      this.emit();
      this.pump();
    });
    try {
      this.mic = await openMic((pcm) => this.onSamples(pcm, my));
    } catch (e) {
      if (this.session !== my) return false;
      this.error = e instanceof CaptureUnavailable ? "unsupported" : "mic-denied";
      this.phase = "error";
      this.emit();
      return false;
    }
    // Cancelled or stopped while the microphone question was open: let go of
    // the microphone at once instead of starting to record after all.
    if (this.session !== my || this.phase !== "starting") {
      this.mic.stop();
      this.mic = null;
      return false;
    }
    this.started = Date.now();
    try {
      const mime = pickMime();
      const rec = new MediaRecorder(this.mic.stream, { mimeType: mime });
      rec.ondataavailable = (e) => e.data.size > 0 && this.chunks.push(e.data);
      rec.start(1000);
      this.recorder = rec;
    } catch {
      this.recorder = null; // reciting still works, just no playback
    }
    // The browser's recogniser (in Chrome it sends audio to Google) runs only
    // while the Quran model is not ready to listen on the device: as a stand-in
    // judge, and for the cursor until the model takes over.
    if (isSpeechSupported() && !(this.mode === "model" && asr.status === "ready")) {
      const expected = new Set(this.opts.ref.norm);
      const r = new Recognizer({
        pickBest: (alts) => pickBestAlternative(alts, expected),
        onTranscript: (text) => {
          if (this.session !== my) return;
          this.hintText = text.split(/\s+/).slice(-6).join(" ");
          this.follow = applyHint(this.follow, text);
          this.emit();
        },
        onFinal: (text) => {
          if (this.session !== my) return;
          const t = (Date.now() - this.started) / 1000;
          this.browserFinals.push({ t, text });
          if (this.mode === "browser") this.applyBrowserFinal(t, text);
        },
      });
      try {
        r.start("ar-SA");
        this.recognizer = r;
      } catch {
        this.recognizer = null;
      }
    }
    this.phase = "listening";
    this.tick = setInterval(() => this.session === my && this.emit(), 500);
    this.emit();
    return true;
  }

  /** How loud the microphone is right now, 0..1 (for the ring round the mic:
   *  the reciter sees that their voice is heard). Smoothed; read it per frame. */
  level = 0;

  private onSamples(pcm: Float32Array, my: number) {
    if (this.session !== my || this.phase !== "listening") return;
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
    const db = 10 * Math.log10(sum / Math.max(1, pcm.length) + 1e-10);
    const target = Math.min(1, Math.max(0, (db + 58) / 40)); // −58 dB silent … −18 dB loud
    this.level += (target - this.level) * (target > this.level ? 0.6 : 0.15);
    // Keep the last RING_SECONDS of audio for joined re-decodes.
    for (let i = 0; i < pcm.length; i++) this.ring[(this.ringEnd + i) % this.ring.length] = pcm[i];
    this.ringEnd += pcm.length;
    for (const ev of this.segmenter.push(pcm)) {
      if (ev.type === "segment") {
        this.segmentsClosed++;
        this.lastSegEnd = ev.segment.endSample / SR;
        this.enqueuePiece(ev.segment);
      } else if (ev.type === "silence" && ev.ms === HESITATION_MS && this.segmentsClosed > 0) {
        this.hesitations.push({ at: ev.atSec, seconds: HESITATION_MS / 1000, beforeRefIndex: -1 });
      }
    }
    if (this.opts.autoStopMs && this.segmentsClosed > 0 && this.segmenter.openMs() === 0) {
      const silentFor = this.ringEnd / SR - this.lastSegEnd;
      if (silentFor * 1000 >= this.opts.autoStopMs) this.opts.onAutoStop?.();
    }
    this.pump();
  }

  private ringSlice(from: number, to: number): Float32Array | null {
    if (to > this.ringEnd || this.ringEnd - from > this.ring.length) return null;
    const out = new Float32Array(to - from);
    for (let i = 0; i < out.length; i++) out[i] = this.ring[(from + i) % this.ring.length];
    return out;
  }

  private enqueuePiece(seg: Segment) {
    if (this.mode !== "model") return; // the browser recogniser carries this attempt
    this.queue.push({ kind: "piece", audio: seg.audio, t0: seg.startSample / SR, seg });
    // While the model downloads, keep a bounded backlog: the oldest pieces go,
    // and words before the first piece heard are never judged skipped.
    // Once the model runs nothing is dropped, however slow the phone: a piece
    // dropped from the middle would read as skipped words.
    let total = 0;
    for (let i = this.queue.length - 1; i >= 0 && asr.status !== "ready"; i--) {
      total += this.queue[i].audio.length / SR;
      if (total > QUEUE_LIMIT_SECONDS) {
        this.queue.splice(0, i + 1);
        break;
      }
    }
    this.emit();
  }

  /** Resolves when nothing is waiting for the model (or it is out of the picture). */
  private settled(): boolean {
    return this.mode !== "model" || (asr.status !== "loading" && asr.status !== "idle" && !this.busy && !this.queue.some((j) => j.kind !== "partial"));
  }
  private wakeWaiters() {
    if (!this.settled()) return;
    const w = this.idleWaiters;
    this.idleWaiters = [];
    w.forEach((f) => f());
  }

  private async pump(): Promise<void> {
    if (this.busy || asr.status !== "ready") return this.wakeWaiters();
    let job = this.queue.find((j) => j.kind === "join") ?? this.queue.find((j) => j.kind === "piece") ?? null;
    if (job) this.queue.splice(this.queue.indexOf(job), 1);
    if (!job) job = this.partialJob();
    if (!job) {
      this.wakeWaiters();
      return this.pumpVowels();
    }
    const my = this.session;
    this.busy = true;
    const res = await asr.decode(job.audio, job.kind !== "partial");
    this.busy = false;
    if (this.session !== my) return;
    if (res) {
      if (job.kind !== "partial") {
        this.lastSpeed = res.ms / Math.max(1, (job.audio.length / SR) * 1000);
        this.timed = true;
      }
      this.handle(job, res);
    } else if (job.kind === "piece" && job.seg) {
      // The model could not decode it: there was voice we could not read,
      // which must never turn into "skipped".
      this.handle(job, { text: "", words: [] }, true);
    }
    this.emit();
    if (this.phase === "finishing") this.emitProgress?.(this.queue.filter((j) => j.kind !== "partial").length);
    void this.pump();
  }

  /** A provisional decode of the piece still being spoken, on fast devices
   *  only — it moves the green along while the reciter is still speaking.
   *  Until a piece has been timed, the graphics chip is taken to be fast. */
  private partialJob(): Job | null {
    const speed = this.timed ? this.lastSpeed : asr.device === "webgpu" ? 0.3 : 1;
    if (this.phase !== "listening" || speed > 0.5) return null;
    const quick = speed <= 0.35;
    if (this.segmenter.openMs() < (quick ? 1400 : 2500) || Date.now() - this.lastPartialAt < (quick ? 900 : 1500)) return null;
    const open = this.segmenter.openAudio();
    if (!open) return null;
    this.lastPartialAt = Date.now();
    return { kind: "partial", audio: open.audio, t0: open.startSample / SR };
  }

  private handle(job: Job, res: { text: string; words: { text: string; start: number; end: number }[] }, failed = false) {
    const abs = res.words.map((w) => ({ text: w.text, start: job.t0 + w.start, end: job.t0 + w.end }));
    if (job.kind === "partial") {
      // The last word of an open piece may be cut mid-word: never use it.
      const tokens = res.text.split(/\s+/).filter(Boolean).slice(0, -1);
      this.hintText = tokens.slice(-6).join(" ");
      this.follow = applyHint(this.follow, tokens.join(" "));
      return;
    }
    if (job.kind === "piece" && job.seg) {
      const seg = job.seg;
      const prev = this.lastPieceInput;
      const input: PieceInput = {
        id: seg.id,
        t0: seg.startSample / SR,
        t1: seg.endSample / SR,
        text: res.text,
        words: abs,
        voiced: seg.voiced.map(([a, b]) => [a / SR, b / SR] as [number, number]),
        // Speech already under way when listening began counts as a cut too:
        // the first word may have been half-caught.
        cutStart: !!prev?.cutEnd || seg.startSample === 0,
        cutEnd: !seg.byPause,
        failed: failed || undefined,
        source: "model",
      };
      this.before.set(input.id, this.follow);
      this.follow = applyPiece(this.follow, input);
      this.queueVowels(input.id, job.audio);
      const tokens = tokenize(res.text).length;
      if (prev && isJoinCandidate(prev, input, tokens)) {
        const from = Math.round(prev.t0 * SR);
        const audio = this.ringSlice(from, seg.endSample);
        if (audio) this.queue.unshift({ kind: "join", audio, t0: prev.t0, a: prev, b: input });
      }
      this.lastPieceInput = input;
      this.hintText = "";
      return;
    }
    if (job.kind === "join" && job.a && job.b) {
      const joined: PieceInput = {
        id: 100000 + job.b.id,
        t0: job.a.t0,
        t1: job.b.t1,
        text: res.text,
        words: abs,
        voiced: [...(job.a.voiced ?? []), ...(job.b.voiced ?? [])],
        replaces: [job.a.id, job.b.id],
        cutStart: job.a.cutStart,
        cutEnd: job.b.cutEnd,
        source: "model",
      };
      const start = this.before.get(job.a.id);
      if (start && preferJoined(fitScore(start, [job.a, job.b]), fitScore(start, [joined]))) {
        this.before.set(joined.id, start); // a later join can build on this one
        this.follow = applyPiece(this.follow, joined);
        this.queueVowels(joined.id, job.audio);
        if (this.lastPieceInput?.id === job.b.id) this.lastPieceInput = joined;
      }
    }
  }

  /** The vowel model is ready: from now on only it judges vowels. */
  private vowelsOn() {
    if (this.follow.vowels || this.phase === "done" || this.phase === "idle") return;
    this.follow = { ...this.follow, vowels: { pieces: new Map(this.vowelBook) } };
  }

  private queueVowels(inputId: number, audio: Float32Array) {
    if (!this.opts.vowelWords || vowels.status === "failed" || !vowels.supported()) return;
    this.vowelJobs.push({ inputId, audio });
    // While it downloads, keep a bounded backlog (the oldest go unjudged).
    let total = 0;
    for (let i = this.vowelJobs.length - 1; i >= 0 && vowels.status !== "ready"; i--) {
      total += this.vowelJobs[i].audio.length / SR;
      if (total > QUEUE_LIMIT_SECONDS) {
        this.vowelJobs.splice(0, i + 1);
        break;
      }
    }
  }

  private vowelsSettled(): boolean {
    return !this.follow.vowels || vowels.status !== "ready" || (!this.vowelBusy && this.vowelJobs.length === 0);
  }
  private wakeVowelWaiters() {
    if (!this.vowelsSettled()) return;
    const w = this.vowelWaiters;
    this.vowelWaiters = [];
    w.forEach((f) => f());
  }

  private async pumpVowels(): Promise<void> {
    if (this.vowelBusy) return;
    if (vowels.status !== "ready" || !this.follow.vowels) return this.wakeVowelWaiters();
    // The listening model first: following the reciter matters more.
    if (this.busy || this.queue.some((j) => j.kind !== "partial")) return;
    const job = this.vowelJobs.shift();
    if (!job) return this.wakeVowelWaiters();
    const piece = this.follow.pieces.find((p) => p.input.id === job.inputId);
    const words = piece && this.opts.vowelWords ? pieceVowelWords(piece, this.opts.vowelWords, this.follow.ref.ayah) : null;
    if (!words) return this.pumpVowels(); // replaced by a join, or not placed
    const my = this.session;
    this.vowelBusy = true;
    const lp = await vowels.logProbs(job.audio);
    this.vowelBusy = false;
    if (this.session !== my || this.phase === "done") return;
    if (lp) {
      this.vowelBook.set(job.inputId, vowelsOfPiece(lp, words));
      this.follow = { ...this.follow, vowels: { pieces: new Map(this.vowelBook) } };
      this.emit();
    }
    if (this.phase === "finishing") this.emitProgress?.(this.vowelJobs.length);
    void this.pumpVowels();
  }

  private applyBrowserFinal(t: number, text: string) {
    const prevT = this.follow.pieces.at(-1)?.input.t1 ?? 0;
    this.follow = applyPiece(this.follow, {
      id: 500000 + this.follow.pieces.length,
      t0: Math.min(prevT, t),
      t1: t,
      text,
      source: "browser",
    });
    this.emit();
  }

  /** The model gave up: the browser's results carry the attempt from here. */
  private fallBackToBrowser() {
    this.queue = this.queue.filter((j) => j.kind === "partial");
    // Everything the model did not get to is carried by the browser's results.
    const after = this.follow.pieces.filter((p) => p.input.source === "model").reduce((t, p) => Math.max(t, p.input.t1), 0);
    for (const f of this.browserFinals) if (f.t > after) this.applyBrowserFinal(f.t, f.text);
  }

  /** Stop and give the verdict. Waits for the model to finish what it heard. */
  private emitProgress: ((waiting: number) => void) | null = null;

  async stop(onProgress?: (waiting: number) => void): Promise<EngineResult | null> {
    if (this.phase === "starting" && this.starting) await this.starting;
    if (this.phase !== "listening") return null;
    this.emitProgress = onProgress ?? null;
    this.stoppedAt = Date.now();
    const my = this.session;
    this.phase = "finishing";
    for (const ev of this.segmenter.flush()) if (ev.type === "segment") this.enqueuePiece(ev.segment);
    this.queue = this.queue.filter((j) => j.kind !== "partial");
    this.recognizer?.stop();
    // First use: the model is still downloading. Do not make the reciter wait
    // for it — judge this attempt with what the browser heard, and say so.
    if (this.mode === "model" && asr.status !== "ready") {
      this.modelPending = true;
      this.browserJudges = true;
      this.queue = [];
      if (isSpeechSupported()) await new Promise((r) => setTimeout(r, 400));
      for (const f of this.browserFinals) this.applyBrowserFinal(f.t, f.text);
    }
    const recording = await this.stopRecorder();
    this.mic?.stop();
    this.mic = null;
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.emit();
    // Let the model finish what it heard (it may still be downloading on first
    // use). Event-driven, not polled: a phone that backgrounds the page throttles
    // timers to once a minute, and a polled wait would hang there.
    if (!this.settled()) {
      onProgress?.(this.queue.length + (this.busy ? 1 : 0));
      const progressOff = asr.subscribe(() => this.wakeWaiters());
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 120_000);
        this.idleWaiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
        void this.pump();
      });
      progressOff();
    }
    if (this.session !== my) return null;
    // Then the vowel model, on what is left (it waits for the listening model).
    if (!this.vowelsSettled()) {
      onProgress?.(this.vowelJobs.length + (this.vowelBusy ? 1 : 0));
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 60_000);
        this.vowelWaiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
        void this.pumpVowels();
      });
    }
    if (this.session !== my) return null;
    // Give the browser's final words a moment to land when it is the judge.
    if (this.mode === "browser") await new Promise((r) => setTimeout(r, 400));
    const seconds = (this.stoppedAt - this.started) / 1000;
    // Resolve each pause to the word that came after it, and its real length.
    for (const h of this.hesitations) {
      const next = this.follow.pieces.find((p) => p.input.t0 >= h.at && p.align);
      h.beforeRefIndex = next?.align?.start ?? -1;
      if (next) h.seconds = Math.max(h.seconds, +(next.input.t0 - h.at).toFixed(1));
    }
    const verdict = verdictOf(this.follow, {
      words: this.opts.words,
      engine: this.mode === "model" ? "Tarteel's Quran model, on your device" : "your browser's speech service",
    });
    this.phase = "done";
    this.unsub?.();
    this.vowelUnsub?.();
    this.emit();
    return {
      verdict,
      recording,
      hesitations: this.hesitations.filter((h) => h.beforeRefIndex >= 0),
      seconds,
      mode: this.mode,
      modelPending: this.modelPending,
    };
  }

  private stopRecorder(): Promise<Blob | null> {
    const rec = this.recorder;
    this.recorder = null;
    if (!rec || rec.state === "inactive") return Promise.resolve(this.chunks.length ? new Blob(this.chunks) : null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType }) : null);
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }

  /** Drop everything (surah change, leaving the page). */
  cancel() {
    this.session++;
    this.phase = "idle";
    this.recognizer?.cancel();
    try {
      this.recorder?.stop();
    } catch {
      /* already stopped */
    }
    this.mic?.stop();
    this.mic = null;
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.unsub?.();
    this.vowelUnsub?.();
    this.queue = [];
    this.vowelJobs = [];
  }
}
