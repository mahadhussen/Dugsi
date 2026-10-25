// Cuts a live recitation into pieces at the reciter's pauses.
//
// Why pieces: the Quran model is accurate on one verse at a time, but on a long
// stretch of audio it can drop a whole verse (measured: Al-Fatiha decoded as
// one 46 s chunk lost verse 2). Reciters pause at the end of a verse and at the
// waqf marks, so cutting there gives verse-sized pieces the model hears well.
// A piece that runs on without a pause is split at its quietest moment before
// it gets long enough to be risky.
//
// Pure and deterministic: samples in, events out. The same samples always give
// the same pieces, so it is tested with synthetic and real audio alike.

export interface SegmenterOptions {
  /** Input sample rate. The microphone capture resamples to this. */
  sampleRate: number;
  /** Analysis frame. */
  frameMs: number;
  /** Speech must last this long before a piece opens (drops clicks, coughs). */
  minSpeechMs: number;
  /** A pause this long closes the piece. Verse ends are longer; word gaps shorter. */
  endSilenceMs: number;
  /** Never let a piece grow past this; split at the quietest frame instead. */
  maxSegmentMs: number;
  /** Window before the cap in which the quietest frame is looked for. */
  splitSearchMs: number;
  /** Audio kept before the first loud frame (the onset of a word is soft). */
  preRollMs: number;
  /** Audio kept after the last loud frame (the tail of a madd fades out). */
  postRollMs: number;
  /** Where between the room's floor and the voice's level a frame counts as
   *  voiced (0.5 = halfway). Adaptive, because a studio recording with reverb
   *  pauses only ~15 dB below the voice while a quiet room pauses 40 dB below. */
  voicedFraction: number;
  /** A piece only opens on frames at least this far above the floor. */
  onsetDb: number;
  /** Absolute floor for the voiced threshold, in dBFS (a silent room). */
  minThresholdDb: number;
  /** Silence lengths (ms) to report once each, e.g. hesitation and auto-stop. */
  silenceMarks: number[];
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  sampleRate: 16000,
  frameMs: 20,
  minSpeechMs: 160,
  endSilenceMs: 300,
  maxSegmentMs: 15000,
  splitSearchMs: 2000,
  preRollMs: 250,
  postRollMs: 120,
  voicedFraction: 0.5,
  onsetDb: 10,
  minThresholdDb: -58,
  silenceMarks: [],
};

export interface Segment {
  id: number;
  /** Position in the whole recording, in samples. */
  startSample: number;
  endSample: number;
  audio: Float32Array;
  /** Closed by a pause (true) or by the length cap (false). */
  byPause: boolean;
  /** Where in the piece there was voice, as [start, end) sample ranges on the
   *  recording clock. Lets the follower tell "said nothing here" apart from
   *  "said something the model could not make out" — the second must never be
   *  judged as a skipped verse. */
  voiced: [number, number][];
}

export type SegmenterEvent =
  | { type: "segment"; segment: Segment }
  /** Silence since the last speech has now lasted `ms` (once per mark). `atSec`
   *  is when the silence began. Only reported after some speech was heard. */
  | { type: "silence"; ms: number; atSec: number };

interface Frame {
  start: number; // sample index
  db: number;
  voiced: boolean;
}

export class Segmenter {
  readonly opts: SegmenterOptions;
  private readonly frameLen: number;
  private carry: Float32Array = new Float32Array(0);
  private carryStart = 0; // sample index of carry[0]
  private history: Float32Array[] = []; // raw frames, newest last (bounded)
  private historyStart = 0; // sample index of history[0][0]
  // Levels in dB, tracked on 100 ms smoothed power so a single zero-filled
  // frame (spliced recordings have them) cannot drag the floor down.
  private floor: number | null = null; // slow minimum: the room between words
  private voice: number | null = null; // fast-attack, slow-release: the voice
  private smooth: number[] = []; // last few frame powers (linear)
  private loudRun = 0;
  private quietRun = 0;
  private open: { start: number; lastVoiced: number; frames: Frame[] } | null = null;
  private nextId = 0;
  private everSpoke = false;
  private silenceStart = 0; // sample index where the current silence began
  private marksDone = new Set<number>();

  constructor(opts: Partial<SegmenterOptions> = {}) {
    this.opts = { ...DEFAULT_SEGMENTER, ...opts };
    this.frameLen = Math.round((this.opts.sampleRate * this.opts.frameMs) / 1000);
  }

  private ms(samples: number): number {
    return (samples / this.opts.sampleRate) * 1000;
  }
  private samples(ms: number): number {
    return Math.round((ms / 1000) * this.opts.sampleRate);
  }

  /** The floor estimate in dBFS (exposed for tests and the level meter). */
  get noiseFloorDb(): number {
    return this.floor ?? -90;
  }

  /** Feed microphone samples (any length). Returns what happened. */
  push(samples: Float32Array): SegmenterEvent[] {
    const out: SegmenterEvent[] = [];
    let buf = samples;
    if (this.carry.length) {
      buf = new Float32Array(this.carry.length + samples.length);
      buf.set(this.carry);
      buf.set(samples, this.carry.length);
    }
    let pos = 0;
    let at = this.carryStart;
    while (buf.length - pos >= this.frameLen) {
      const frame = buf.slice(pos, pos + this.frameLen);
      this.frame(frame, at, out);
      pos += this.frameLen;
      at += this.frameLen;
    }
    this.carry = buf.slice(pos);
    this.carryStart = at;
    return out;
  }

  /** End of recording: close whatever is open. */
  flush(): SegmenterEvent[] {
    const out: SegmenterEvent[] = [];
    if (this.open) this.close(this.open.lastVoiced + this.frameLen, true, out);
    return out;
  }

  /** Audio of the piece still being spoken (for a provisional decode), or null. */
  openAudio(): { startSample: number; audio: Float32Array } | null {
    if (!this.open) return null;
    const end = this.historyStart + this.history.length * this.frameLen;
    return { startSample: this.open.start, audio: this.slice(this.open.start, end) };
  }

  /** Length of the open piece in ms (0 when none). */
  openMs(): number {
    if (!this.open) return 0;
    const end = this.historyStart + this.history.length * this.frameLen;
    return this.ms(end - this.open.start);
  }

  private frame(frame: Float32Array, at: number, out: SegmenterEvent[]): void {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const power = sum / frame.length;
    const db = 10 * Math.log10(power + 1e-12);

    this.remember(frame);

    this.smooth.push(power);
    if (this.smooth.length > 5) this.smooth.shift();
    const level = 10 * Math.log10(this.smooth.reduce((a, b) => a + b, 0) / this.smooth.length + 1e-12);

    // Floor: follows the quietest level down at once, creeps up ~1 dB/s.
    const rise = this.opts.frameMs / 1000;
    this.floor = this.floor === null ? level : Math.min(this.floor + rise, level);
    // Voice: jumps up with speech, fades ~2.5 dB/s in pauses.
    if (this.voice === null || level > this.voice) this.voice = this.voice === null ? level : 0.7 * this.voice + 0.3 * level;
    else this.voice -= 2.5 * rise;
    const floor = this.floor;
    const range = Math.max(0, this.voice - floor);
    const voicedThreshold = Math.max(
      this.opts.minThresholdDb,
      range >= 12 ? floor + this.opts.voicedFraction * range : floor + 6,
    );
    const voiced = level > voicedThreshold;

    if (!this.open) {
      if (db > voicedThreshold && db > floor + this.opts.onsetDb) {
        this.loudRun++;
        if (this.ms(this.loudRun * this.frameLen) >= this.opts.minSpeechMs) {
          const firstLoud = at - (this.loudRun - 1) * this.frameLen;
          // Overlapping the previous piece's tail is fine; cutting off the soft
          // onset of the first word is not (measured: it garbles that word).
          const start = Math.max(this.historyStart, firstLoud - this.samples(this.opts.preRollMs));
          const onset: Frame[] = [];
          for (let k = this.loudRun - 1; k >= 1; k--) onset.push({ start: at - k * this.frameLen, db: level, voiced: true });
          this.open = { start, lastVoiced: at, frames: onset };
          this.everSpoke = true;
          this.marksDone.clear();
          this.quietRun = 0;
        }
      } else {
        this.loudRun = 0;
        this.reportSilence(at, out);
      }
      if (!this.open) return;
    }

    const open = this.open;
    open.frames.push({ start: at, db: level, voiced });
    if (voiced) {
      open.lastVoiced = at;
      this.quietRun = 0;
    } else {
      this.quietRun++;
    }

    // A pause long enough closes the piece.
    if (this.ms(this.quietRun * this.frameLen) >= this.opts.endSilenceMs) {
      this.close(open.lastVoiced + this.frameLen, true, out);
      this.silenceStart = open.lastVoiced + this.frameLen;
      this.loudRun = 0;
      this.quietRun = 0;
      return;
    }

    // Too long without a pause: split at the quietest frame near the end.
    if (this.ms(at + this.frameLen - open.start) >= this.opts.maxSegmentMs) {
      // The quietest ~180 ms, not the quietest single frame: one quiet frame
      // can be the hiss of a ص in the middle of a word (measured: cutting there
      // turned "ٱلصَّلَوٰةَ وَمِمَّا" into "ولا تومما").
      const from = at + this.frameLen - this.samples(this.opts.splitSearchMs);
      const win = open.frames.filter((f) => f.start >= from);
      let bestIdx = -1;
      let bestAvg = Infinity;
      for (let i = 0; i < win.length; i++) {
        let sum = 0;
        let n = 0;
        for (let k = Math.max(0, i - 4); k <= Math.min(win.length - 1, i + 4); k++) {
          sum += win[k].db;
          n++;
        }
        if (sum / n < bestAvg) {
          bestAvg = sum / n;
          bestIdx = i;
        }
      }
      const cut = bestIdx >= 0 ? win[bestIdx].start + Math.floor(this.frameLen / 2) : at + this.frameLen;
      this.close(cut, false, out);
      // The next piece starts a little before the cut so its first word is whole.
      const nextStart = Math.max(this.historyStart, cut - this.samples(this.opts.preRollMs));
      const rest = open.frames.filter((f) => f.start >= nextStart);
      this.open = { start: nextStart, lastVoiced: rest.length ? rest[rest.length - 1].start : cut, frames: rest };
      this.quietRun = 0;
    }
  }

  private reportSilence(at: number, out: SegmenterEvent[]): void {
    if (!this.everSpoke || this.opts.silenceMarks.length === 0) return;
    const silentMs = this.ms(at + this.frameLen - this.silenceStart);
    for (const mark of this.opts.silenceMarks) {
      if (silentMs >= mark && !this.marksDone.has(mark)) {
        this.marksDone.add(mark);
        out.push({ type: "silence", ms: mark, atSec: this.silenceStart / this.opts.sampleRate });
      }
    }
  }

  private close(endExclusive: number, byPause: boolean, out: SegmenterEvent[]): void {
    const open = this.open;
    this.open = null;
    if (!open) return;
    const available = this.historyStart + this.history.length * this.frameLen;
    const end = Math.min(available, byPause ? endExclusive + this.samples(this.opts.postRollMs) : endExclusive);
    if (end <= open.start) return;
    const voicedRuns: [number, number][] = [];
    for (const f of open.frames) {
      if (!f.voiced || f.start >= end) continue;
      const last = voicedRuns[voicedRuns.length - 1];
      if (last && f.start <= last[1]) last[1] = f.start + this.frameLen;
      else voicedRuns.push([f.start, f.start + this.frameLen]);
    }
    out.push({
      type: "segment",
      segment: {
        id: this.nextId++,
        startSample: open.start,
        endSample: end,
        audio: this.slice(open.start, end),
        byPause,
        voiced: voicedRuns,
      },
    });
  }

  // Keep enough raw audio for the open piece plus its pre-roll; drop the rest.
  private remember(frame: Float32Array): void {
    this.history.push(frame);
    const keepFrom = this.open
      ? this.open.start - this.frameLen
      : this.historyStart + this.history.length * this.frameLen - this.samples(this.opts.preRollMs + 400);
    while (this.history.length > 1 && this.historyStart + this.frameLen <= keepFrom) {
      this.history.shift();
      this.historyStart += this.frameLen;
    }
  }

  private slice(from: number, to: number): Float32Array {
    const a = Math.max(from, this.historyStart);
    const b = Math.min(to, this.historyStart + this.history.length * this.frameLen);
    const out = new Float32Array(Math.max(0, b - a));
    let w = 0;
    for (let i = 0; i < this.history.length && w < out.length; i++) {
      const fStart = this.historyStart + i * this.frameLen;
      const fEnd = fStart + this.frameLen;
      if (fEnd <= a || fStart >= b) continue;
      const s = Math.max(a, fStart) - fStart;
      const e = Math.min(b, fEnd) - fStart;
      out.set(this.history[i].subarray(s, e), w);
      w += e - s;
    }
    return out;
  }
}

/** Run a whole recording through a fresh segmenter (tests, the eval script). */
export function segmentAll(samples: Float32Array, opts: Partial<SegmenterOptions> = {}, chunk = 2048): SegmenterEvent[] {
  const seg = new Segmenter(opts);
  const out: SegmenterEvent[] = [];
  for (let i = 0; i < samples.length; i += chunk) out.push(...seg.push(samples.subarray(i, i + chunk)));
  out.push(...seg.flush());
  return out;
}
