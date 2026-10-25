// The listening engine: one Sheikh, one continuous recitation.
//
// Two things used to break the flow at the end of every ayah, and badly at the
// end of every surah:
//
//   1. The next ayah only started downloading once the current one had ended,
//      so you heard the network latency as a gap.
//   2. The player lived inside the reader. Flowing into the next surah reloaded
//      the page text, which unmounted the player — taking the audio with it.
//
// A second kind of Sheikh complicates this a little: a few were only ever
// recorded as one file per surah. For them a "piece" of recitation is a whole
// surah rather than one ayah, and the engine simply steps surah by surah.
//
// 2026-10-25: on iPhone the "next ayah is already buffered" promise did not
// hold (iOS ignores preload), so every verse waited for the network, and the
// play button turned into a spinner while it did. Now a Sheikh with a timed
// whole-surah recording (lib/listen/surah-timing.ts) plays the surah as ONE
// file: no file changes inside a surah, so no gaps, and verse jumps and
// repeats are seeks. Per-ayah Sheikhs fetch the next ayah into memory ahead.
//
// So playback lives here instead, outside React, in a pair of audio elements.
// One plays while the other quietly loads the ayah after it (across the surah
// boundary too), and at the end they simply swap: the next ayah is already
// buffered, so it starts in the same tick. The reader follows along afterwards;
// it can take its time without the recitation waiting for it.

import { ayahAudioUrl, getReciter, hasPerAyahAudio } from "./audio-quran";
import { playableUrl } from "./audio-cache";
import { forgetResolved, surahAudioUrl } from "./mp3quran";
import { surahMeta } from "./quran";
import { loadTimings } from "./quran/timings";
import { hasSurahTiming, loadSurahTiming, verseAt, verseEnd, verseStart, type SurahTiming } from "./listen/surah-timing";
import { useSyncExternalStore } from "react";

export interface Ref {
  surah: number;
  verse: number;
}

export type Status = "idle" | "loading" | "error";

export interface Loop {
  from: Ref;
  to: Ref;
  /** How many times in all; null = until stopped. */
  times: number | null;
  /** Passes completed so far. */
  done: number;
  /** After the last pass: stop (a single tapped verse) or carry on reciting. */
  then?: "stop" | "continue";
}

export interface ListenState {
  /** The ayah being recited (or the one play would start from). */
  at: Ref;
  /** Whether we mean to be playing — kept true across ayah and surah changes. */
  playing: boolean;
  status: Status;
  /** 0.75 to shadow a verse, 1.25 to review. */
  rate: number;
  /** Start the surah again instead of flowing into the next one. */
  repeat: boolean;
  /** Repeat a verse or a stretch of verses (the Sheikh reads it again). */
  loop: Loop | null;
  /** "surah": one file per surah with verse timings; "ayah": one file per verse;
   *  "file": one file per surah without timings (no verse positions). */
  mode: "surah" | "ayah" | "file";
}

const ayatIn = (surah: number) => surahMeta(surah)?.ayahCount ?? 0;
const sameRef = (a: Ref | null, b: Ref | null) => !!a && !!b && a.surah === b.surah && a.verse === b.verse;

/** The ayah after this one: next verse, next surah, or back to the start on repeat. */
export function nextRef(at: Ref, repeat: boolean): Ref | null {
  if (at.verse < ayatIn(at.surah)) return { surah: at.surah, verse: at.verse + 1 };
  if (repeat) return { surah: at.surah, verse: 1 };
  if (at.surah < 114) return { surah: at.surah + 1, verse: 1 };
  return null;
}

/** The ayah before this one, stepping back into the previous surah if needed. */
export function prevRef(at: Ref): Ref | null {
  if (at.verse > 1) return { surah: at.surah, verse: at.verse - 1 };
  if (at.surah > 1) return { surah: at.surah - 1, verse: ayatIn(at.surah - 1) };
  return null;
}

/** The next surah, for a Sheikh whose recording is one file per surah. */
export function nextSurahRef(at: Ref, repeat: boolean): Ref | null {
  if (repeat) return { surah: at.surah, verse: 1 };
  if (at.surah < 114) return { surah: at.surah + 1, verse: 1 };
  return null;
}

/** The previous surah, same kind of Sheikh. */
export function prevSurahRef(at: Ref): Ref | null {
  return at.surah > 1 ? { surah: at.surah - 1, verse: 1 } : null;
}

/**
 * The piece of recitation that follows this one: the next ayah for a per-ayah
 * Sheikh, the next surah for a whole-surah one.
 */
export function nextPiece(at: Ref, repeat: boolean, perAyah: boolean): Ref | null {
  return perAyah ? nextRef(at, repeat) : nextSurahRef(at, repeat);
}

// ── State ──────────────────────────────────────────────────────────────────

let state: ListenState = { at: { surah: 1, verse: 1 }, playing: false, status: "idle", rate: 1, repeat: false, loop: null, mode: "ayah" };
let reciterId = "alafasy";

const perAyah = (): boolean => hasPerAyahAudio(getReciter(reciterId));
/** What a surah is expected to play as, before its timings are known. */
const modeNow = (): ListenState["mode"] => (hasSurahTiming(reciterId) ? "surah" : perAyah() ? "ayah" : "file");

const listeners = new Set<() => void>();

function sameLoop(a: Loop | null, b: Loop | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return sameRef(a.from, b.from) && sameRef(a.to, b.to) && a.times === b.times && a.done === b.done && a.then === b.then;
}

function set(patch: Partial<ListenState>): void {
  const next = { ...state, ...patch };
  if (
    next.playing === state.playing &&
    next.status === state.status &&
    next.rate === state.rate &&
    next.repeat === state.repeat &&
    next.mode === state.mode &&
    sameLoop(next.loop, state.loop) &&
    sameRef(next.at, state.at)
  ) {
    return;
  }
  state = next;
  listeners.forEach((l) => l());
}

// ── The two players ────────────────────────────────────────────────────────

let decks: [HTMLAudioElement, HTMLAudioElement] | null = null;
let live = 0; // which deck is playing
/** What each deck has been asked to load, what it is actually holding, how it
 *  plays (a surah file with timings, a verse file, or a surah file without
 *  timings), and a token so a slow load can never overwrite a newer one. */
const wanted: (Ref | null)[] = [null, null];
const armed: (Ref | null)[] = [null, null];
const deckMode: (ListenState["mode"] | null)[] = [null, null];
const deckTiming: (SurahTiming | null)[] = [null, null];
/** While a deck is moving to a verse, its position means nothing yet. */
const seeking = [false, false];
const token = [0, 0];
let unlocked = false;
let primedSurah = 0;

// A tenth of a second of silence: played on both decks inside the first tap,
// it "unlocks" them on iOS so later programmatic plays are allowed.
const SILENCE = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

const liveMode = (): ListenState["mode"] => deckMode[live] ?? modeNow();

function decksReady(): [HTMLAudioElement, HTMLAudioElement] | null {
  if (decks) return decks;
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  const make = (i: number) => {
    const a = new Audio();
    a.preload = "auto";
    const mine = () => !!decks && decks[live] === a && a.src !== SILENCE;
    a.addEventListener("ended", () => mine() && advance());
    a.addEventListener("playing", () => mine() && set({ status: "idle" }));
    a.addEventListener("waiting", () => mine() && set({ status: "loading" }));
    a.addEventListener("timeupdate", () => mine() && follow(a));
    a.addEventListener("error", () => {
      if (a.src === SILENCE) return;
      // Forget what this deck held, so the next play loads it again (a dropped
      // connection mid-surah must not leave the player dead).
      wanted[i] = null;
      armed[i] = null;
      if (!mine()) return;
      if (!perAyah()) forgetResolved(reciterId);
      if (state.playing) set({ status: "error" });
    });
    return a;
  };
  decks = [make(0), make(1)];
  return decks;
}

/**
 * iOS only lets an audio element play after a user has touched it, and the
 * touch unlocks that one element. We play from two, so both are played inside
 * the first tap: silence where a deck is empty, and a muted moment where it
 * already holds a file (it is put back where it was).
 */
function unlock(): void {
  if (unlocked) return;
  const d = decksReady();
  if (!d) return;
  unlocked = true;
  // The deck about to sound is never paused by this: the real play() follows
  // in the same tap, and a late pause() from here would stop it (measured).
  const sounding = (a: HTMLAudioElement) => decks !== null && decks[live] === a && state.playing;
  for (const a of d) {
    if (!a.src || a.src === SILENCE) {
      a.src = SILENCE;
      void a
        .play()
        .then(() => {
          if (!sounding(a)) a.pause();
        })
        .catch(() => undefined);
      continue;
    }
    if (a === d[live]) continue; // played for real right after this
    const at = a.currentTime;
    const wasMuted = a.muted;
    a.muted = true;
    void a
      .play()
      .then(() => {
        if (sounding(a)) return;
        a.pause();
        a.currentTime = at;
      })
      .catch(() => undefined)
      .finally(() => {
        a.muted = wasMuted;
      });
  }
}

// ── Fetching ahead (per-ayah) ──────────────────────────────────────────────

const ahead = new Map<string, string>(); // url → blob url, a handful at most

/** Fetch a verse file into memory so its deck can start instantly — iOS will
 *  not buffer an audio element before it plays, but a fetch it does run. */
async function fetchAhead(url: string): Promise<string> {
  const saved = await playableUrl(url);
  if (saved !== url) return saved;
  const hit = ahead.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blobUrl = URL.createObjectURL(await res.blob());
    ahead.set(url, blobUrl);
    while (ahead.size > 6) {
      const [oldUrl, oldBlob] = ahead.entries().next().value as [string, string];
      ahead.delete(oldUrl);
      URL.revokeObjectURL(oldBlob);
    }
    return blobUrl;
  } catch {
    return url;
  }
}

/**
 * Load a piece into a deck: a surah file positioned at a verse (when its
 * timings check out), else the verse's own file, else — for a Sheikh only
 * recorded as whole surahs — the surah file from its start. Resolves whether
 * something playable is now in the deck.
 */
async function load(deck: number, at: Ref): Promise<boolean> {
  const d = decksReady();
  if (!d) return false;
  if (sameRef(wanted[deck], at) && armed[deck]) return true;
  const mine = ++token[deck];
  wanted[deck] = at;
  armed[deck] = null;
  void loadTimings(reciterId, at.surah); // word timings, per-ayah read-along
  const a = d[deck];
  const timing = hasSurahTiming(reciterId) ? await loadSurahTiming(reciterId, at.surah, ayatIn(at.surah)) : null;
  if (token[deck] !== mine) return false;

  if (timing) {
    // Same surah file already in this deck: just move to the verse.
    if (deckMode[deck] === "surah" && deckTiming[deck]?.surah === at.surah && a.src && a.src !== SILENCE) {
      a.currentTime = verseStart(timing.verses, at.verse);
      armed[deck] = at;
      return true;
    }
    const src = await playableUrl(timing.url);
    if (token[deck] !== mine) return false;
    seeking[deck] = true;
    deckMode[deck] = "surah";
    deckTiming[deck] = timing;
    a.src = src;
    a.playbackRate = state.rate;
    a.load();
    const start = verseStart(timing.verses, at.verse);
    if (start > 0) {
      await new Promise<void>((resolve) => {
        const go = () => {
          if (token[deck] === mine) {
            try {
              a.currentTime = start;
            } catch {
              /* seeking before data: the browser retries */
            }
          }
          resolve();
        };
        if (a.readyState >= 1) go();
        else a.addEventListener("loadedmetadata", go, { once: true });
        setTimeout(resolve, 4000);
      });
    }
    seeking[deck] = false;
    if (token[deck] !== mine) return false;
    armed[deck] = at;
    if (deck === live) set({ mode: "surah" });
    return true;
  }

  if (perAyah()) {
    // No usable timings (none for this Sheikh, the API is down, or this
    // surah's timings failed the checks): verse by verse, from the verse files.
    const src = await fetchAhead(ayahAudioUrl(at.surah, at.verse, reciterId));
    if (token[deck] !== mine) return false;
    deckMode[deck] = "ayah";
    deckTiming[deck] = null;
    a.src = src;
    a.playbackRate = state.rate;
    a.load();
    armed[deck] = at;
    if (deck === live) set({ mode: "ayah" });
    return true;
  }

  // Recorded only as whole surahs, and no timings: the surah from its start.
  const file = await surahAudioUrl(reciterId, at.surah);
  if (token[deck] !== mine) return false;
  if (!file) {
    wanted[deck] = null;
    if (deck === live) set({ status: "error" });
    return false;
  }
  const src = await playableUrl(file);
  if (token[deck] !== mine) return false;
  deckMode[deck] = "file";
  deckTiming[deck] = null;
  a.src = src;
  a.playbackRate = state.rate;
  a.load();
  armed[deck] = { surah: at.surah, verse: 1 };
  if (deck === live) set({ mode: "file" });
  return true;
}

/** Where a loop's last verse ends in the file: some recordings' timings run a
 *  little past the end of the file, so never wait for a time that never comes. */
function loopEnd(timing: SurahTiming, verse: number, a: HTMLAudioElement): number {
  const end = verseEnd(timing.verses, verse);
  return Number.isFinite(a.duration) && a.duration > 0 ? Math.min(end, a.duration - 0.25) : end;
}

/** Track where the recitation is inside a surah file, run loops, and warm the
 *  next surah near the end. Called on every timeupdate and animation frame. */
function follow(a: HTMLAudioElement): void {
  if (seeking[live]) return;
  const timing = deckTiming[live];
  const t = a.currentTime;
  if (timing && deckMode[live] === "surah") {
    const loop = state.loop;
    if (loop && loop.to.surah === timing.surah && state.playing && t >= loopEnd(timing, loop.to.verse, a) - 0.04) {
      if (loopAgain()) return;
    }
    const v = verseAt(timing.verses, t);
    if (v !== state.at.verse && state.at.surah === timing.surah) set({ at: { surah: timing.surah, verse: v } });
  }
  // Near the end of a surah file, have the next one ready in the other deck.
  if (deckMode[live] !== "ayah" && Number.isFinite(a.duration) && a.duration - t < 25 && primedSurah !== state.at.surah) {
    primedSurah = state.at.surah;
    const next = nextSurahRef(state.at, state.repeat);
    if (next && !state.repeat && !state.loop) void load(1 - live, next);
  }
}

/**
 * The loop's last verse has just ended. Read it again (true), or finish the
 * loop — stopping for a single tapped verse, else carrying on (false).
 */
function loopAgain(): boolean {
  const loop = state.loop;
  if (!loop) return false;
  const more = loop.times === null || loop.done + 1 < loop.times;
  if (more) {
    set({ loop: { ...loop, done: loop.done + 1 } });
    seek(loop.from, true, true);
    return true;
  }
  set({ loop: null });
  if (loop.then === "stop") {
    pause();
    return true;
  }
  return false;
}

let raf = 0;
function tickWhilePlaying(): void {
  cancelAnimationFrame(raf);
  const step = () => {
    const d = decks;
    if (!d || !state.playing) return;
    follow(d[live]);
    raf = requestAnimationFrame(step);
  };
  if (typeof requestAnimationFrame !== "undefined") raf = requestAnimationFrame(step);
}

/** Start the ayah after the current one loading, so the swap is instant. */
function primeNext(): void {
  // A surah file is primed near its end (see follow), not now: pre-loading
  // the next surah would pull megabytes the listener may never hear.
  if (liveMode() !== "ayah") return;
  const next = nextRef(state.at, state.repeat);
  if (next) void load(1 - live, next);
}

function playLive(): void {
  const d = decksReady();
  if (!d) return;
  const a = d[live];
  if (!a.src || a.src === SILENCE) return; // nothing loaded: never "play" silence
  a.playbackRate = state.rate;
  a.play()
    .then(() => {
      set({ status: "idle" });
      tickWhilePlaying();
    })
    .catch((err: unknown) => {
      // A rapid change of ayah aborts the previous play — that is expected.
      if ((err as { name?: string })?.name !== "AbortError" && state.playing) set({ status: "error" });
    });
}

/** The current piece has ended: loop, or hand over to the deck already loaded. */
function advance(): void {
  const d = decksReady();
  if (!d) return;
  const mode = liveMode();
  const loop = state.loop;
  // The loop's last verse ended with its file (per-ayah, or the last verse of a surah file).
  if (loop && sameRef(state.at, loop.to) && (mode === "ayah" || loop.to.surah === state.at.surah)) {
    if (loopAgain()) return;
  }
  const next = mode === "ayah" ? nextRef(state.at, state.repeat) : nextSurahRef(state.at, state.repeat);
  if (!next) {
    set({ playing: false });
    return;
  }
  const other = 1 - live;
  if (sameRef(armed[other], next)) {
    // The usual path: the file is already there, so the swap makes no gap.
    live = other;
    set({ at: next, mode: deckMode[live] ?? mode });
    playLive();
  } else {
    // Loading is still catching up. The status shows next to the button; the
    // button itself stays play/pause.
    set({ at: next, status: "loading" });
    void load(live, next).then((ok) => ok && state.playing && playLive());
  }
  primeNext();
}

// ── Commands ───────────────────────────────────────────────────────────────

/** Jump to an ayah, keeping playing if we were. A jump by the listener ends a
 *  loop; the loop's own jumps keep it (`keepLoop`). */
export function seek(at: Ref, alsoPlay?: boolean, keepLoop = false): void {
  if (!keepLoop && state.loop) set({ loop: null });
  // A surah file without timings has no verse offsets inside it.
  const verse = liveMode() === "file" && !hasSurahTiming(reciterId) ? 1 : Math.max(1, Math.min(ayatIn(at.surah) || 1, at.verse));
  const target = { surah: at.surah, verse };
  if (sameRef(state.at, target) && !alsoPlay && wanted[live] && armed[live]) return;
  const d = decksReady();
  // A jump inside the surah file already playing is just a seek: no reload.
  const timing = deckTiming[live];
  if (d && timing && timing.surah === target.surah && deckMode[live] === "surah" && armed[live]) {
    d[live].currentTime = verseStart(timing.verses, target.verse);
    set({ at: target });
    if (alsoPlay && !state.playing) {
      unlock();
      set({ playing: true });
      playLive();
    }
    return;
  }
  set({ at: target, status: d ? "loading" : "idle" });
  if (!d) return;
  d[1 - live].pause();
  if (alsoPlay && !state.playing) {
    unlock();
    set({ playing: true });
  }
  void load(live, target).then((ok) => {
    if (!ok) return;
    if (state.playing) playLive();
    else set({ status: "idle" });
    primeNext();
  });
}

/** Start playing, from the current ayah. Must be called inside a tap on iOS. */
export function play(): void {
  unlock();
  const d = decksReady();
  set({ playing: true });
  if (!d) return;
  const holds = armed[live] && (sameRef(armed[live], state.at) || (deckTiming[live]?.surah === state.at.surah && deckMode[live] === "surah"));
  if (holds && state.status !== "error") {
    playLive();
  } else {
    // Nothing loaded yet, or the last attempt failed (a dropped connection):
    // load again.
    wanted[live] = null;
    set({ status: "loading" });
    void load(live, state.at).then((ok) => ok && state.playing && playLive());
  }
  primeNext();
}

export function pause(): void {
  set({ playing: false, status: state.status === "error" ? "error" : "idle" });
  cancelAnimationFrame(raf);
  const d = decksReady();
  if (!d) return;
  d[0].pause();
  d[1].pause();
}

export function toggle(): void {
  if (state.playing) pause();
  else play();
}

export function next(): void {
  const n = liveMode() === "file" ? nextSurahRef(state.at, false) : nextRef(state.at, false);
  if (n) seek(n);
}

export function previous(): void {
  const p = liveMode() === "file" ? prevSurahRef(state.at) : prevRef(state.at);
  if (p) seek(p);
}

export function setRate(rate: number): void {
  set({ rate });
  const d = decksReady();
  if (d) {
    d[0].playbackRate = rate;
    d[1].playbackRate = rate;
  }
}

export function setRepeat(repeat: boolean): void {
  if (repeat === state.repeat) return;
  set({ repeat });
  primedSurah = 0;
  primeNext(); // the ayah after the last one just changed
}

/**
 * Have the Sheikh read `from`..`to` (inclusive) `times` times (null = until
 * stopped), starting now. One verse: from = to.
 */
export function repeatRange(from: Ref, to: Ref, times: number | null, then: "stop" | "continue" = "continue"): void {
  const a = from.surah < to.surah || (from.surah === to.surah && from.verse <= to.verse) ? from : to;
  const b = a === from ? to : from;
  set({ loop: { from: a, to: b, times, done: 0, then } });
  seek(a, true, true);
}

export function clearLoop(): void {
  set({ loop: null });
}

/** Switch Sheikh: the same ayah, in the new voice, still playing. */
export function setReciter(id: string): void {
  if (id === reciterId) return;
  reciterId = id;
  wanted[0] = wanted[1] = null;
  armed[0] = armed[1] = null;
  deckTiming[0] = deckTiming[1] = null;
  deckMode[0] = deckMode[1] = null;
  primedSurah = 0;
  token[0]++;
  token[1]++;
  const d = decksReady();
  set({ mode: modeNow() });
  if (!d) return;
  // The old voice must stop now, not play on while the new one loads.
  d[0].pause();
  d[1].pause();
  const at = modeNow() === "file" ? { surah: state.at.surah, verse: 1 } : state.at;
  set({ at, status: state.playing ? "loading" : "idle" });
  void load(live, at).then((ok) => {
    if (!ok) return;
    if (state.playing) playLive();
    else set({ status: "idle" });
    primeNext();
  });
}

export function currentReciterId(): string {
  return reciterId;
}

/** The element actually sounding, for the word-by-word read-along. */
export function liveAudio(): HTMLAudioElement | null {
  return decks ? decks[live] : null;
}

/** Verse timings of the surah file sounding now (whole-surah mode), or null. */
export function liveTiming(): SurahTiming | null {
  return decks && deckMode[live] === "surah" ? deckTiming[live] : null;
}

// ── React binding ──────────────────────────────────────────────────────────

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const SERVER_STATE: ListenState = {
  at: { surah: 1, verse: 1 },
  playing: false,
  status: "idle",
  rate: 1,
  repeat: false,
  loop: null,
  mode: "ayah",
};

/** Be told whenever the listening state changes (outside React). */
export function onListenChange(cb: () => void): () => void {
  return subscribe(cb);
}

export function useListen(): ListenState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}

export function getListenState(): ListenState {
  return state;
}
