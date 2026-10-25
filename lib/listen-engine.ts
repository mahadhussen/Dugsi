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
/** One file per surah: a timed recording, or a Sheikh only published that way. */
const wholeSurah = (): boolean => hasSurahTiming(reciterId) || !perAyah();
const modeNow = (): ListenState["mode"] => (hasSurahTiming(reciterId) ? "surah" : perAyah() ? "ayah" : "file");

const listeners = new Set<() => void>();

function sameLoop(a: Loop | null, b: Loop | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return sameRef(a.from, b.from) && sameRef(a.to, b.to) && a.times === b.times && a.done === b.done;
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
/** What each deck has been asked to load, what it is actually holding, and a
 *  token so a slow load can never overwrite a newer one. In whole-surah mode a
 *  deck holds a surah (verse is where it was started). */
const wanted: (Ref | null)[] = [null, null];
const armed: (Ref | null)[] = [null, null];
const deckTiming: (SurahTiming | null)[] = [null, null];
const token = [0, 0];
let unlocked = false;
let primedSurah = 0;

// A tenth of a second of silence: played on both decks inside the first tap,
// it "unlocks" them on iOS so later programmatic plays are allowed.
const SILENCE = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

function decksReady(): [HTMLAudioElement, HTMLAudioElement] | null {
  if (decks) return decks;
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  const make = () => {
    const a = new Audio();
    a.preload = "auto";
    a.addEventListener("ended", () => {
      if (decks && decks[live] === a && a.src !== SILENCE) advance();
    });
    a.addEventListener("playing", () => {
      if (decks && decks[live] === a) set({ status: "idle" });
    });
    a.addEventListener("waiting", () => {
      if (decks && decks[live] === a) set({ status: "loading" });
    });
    a.addEventListener("timeupdate", () => {
      if (decks && decks[live] === a) follow(a);
    });
    a.addEventListener("error", () => {
      if (!decks || decks[live] !== a || a.src === SILENCE) return;
      // A whole-surah recording that refuses to load usually means the server we
      // remembered has since moved, so ask the catalogue again next time.
      if (!perAyah()) forgetResolved(reciterId);
      if (state.playing) set({ status: "error" });
    });
    return a;
  };
  decks = [make(), make()];
  return decks;
}

/**
 * iOS only lets an audio element play after a user has touched it, and the
 * touch unlocks that one element. We play from two, so both play a moment of
 * silence inside the first tap. (Playing an element with no source, as before,
 * is refused — so the second deck was never unlocked.)
 */
function unlock(): void {
  if (unlocked) return;
  const d = decksReady();
  if (!d) return;
  unlocked = true;
  for (const a of d) {
    if (a.src && a.src !== SILENCE) continue;
    a.src = SILENCE;
    void a.play().then(() => a.pause()).catch(() => undefined);
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

/** Load a piece into a deck: an ayah file, or a surah file positioned at a verse. */
async function load(deck: number, at: Ref): Promise<void> {
  const d = decksReady();
  if (!d) return;
  if (sameRef(wanted[deck], at)) return;
  const mine = ++token[deck];
  wanted[deck] = at;
  armed[deck] = null;
  void loadTimings(reciterId, at.surah); // word timings, per-ayah read-along
  const a = d[deck];
  if (wholeSurah()) {
    const timing = hasSurahTiming(reciterId) ? await loadSurahTiming(reciterId, at.surah, ayatIn(at.surah)) : null;
    if (token[deck] !== mine) return;
    // Same surah already in this deck: just move to the verse.
    if (deckTiming[deck] && timing && deckTiming[deck]!.surah === at.surah && a.src && a.src !== SILENCE) {
      a.currentTime = verseStart(timing.verses, at.verse);
      armed[deck] = at;
      return;
    }
    const file = timing?.url ?? (await surahAudioUrl(reciterId, at.surah));
    if (token[deck] !== mine) return;
    if (!file) {
      wanted[deck] = null;
      if (deck === live) set({ status: "error" });
      return;
    }
    const src = await playableUrl(file);
    if (token[deck] !== mine) return;
    deckTiming[deck] = timing;
    a.src = src;
    a.playbackRate = state.rate;
    a.load();
    const start = timing ? verseStart(timing.verses, at.verse) : 0;
    if (start > 0) {
      await new Promise<void>((resolve) => {
        const go = () => {
          try {
            a.currentTime = start;
          } catch {
            /* seeking before data: the browser retries */
          }
          resolve();
        };
        if (a.readyState >= 1) go();
        else a.addEventListener("loadedmetadata", go, { once: true });
        setTimeout(resolve, 4000);
      });
      if (token[deck] !== mine) return;
    }
    armed[deck] = at;
    return;
  }
  const file = ayahAudioUrl(at.surah, at.verse, reciterId);
  const src = await fetchAhead(file);
  if (token[deck] !== mine) return;
  deckTiming[deck] = null;
  a.src = src;
  a.playbackRate = state.rate;
  a.load();
  armed[deck] = at;
}

/** Track where the recitation is inside a surah file, run loops, and warm the
 *  next surah near the end. Called on every timeupdate and animation frame. */
function follow(a: HTMLAudioElement): void {
  const timing = deckTiming[live];
  const t = a.currentTime;
  if (timing && state.mode === "surah") {
    const loop = state.loop;
    if (loop && loop.to.surah === timing.surah && state.playing) {
      const end = verseEnd(timing.verses, loop.to.verse);
      if (t >= end - 0.04) {
        const more = loop.times === null || loop.done + 1 < loop.times;
        if (more) {
          a.currentTime = timing.verses[loop.from.verse - 1]?.start ?? 0;
          set({ loop: { ...loop, done: loop.done + 1 }, at: loop.from });
          return;
        }
        set({ loop: null });
        if (loop.then === "stop") {
          pause();
          return;
        }
      }
    }
    const v = verseAt(timing.verses, t);
    if (v !== state.at.verse && state.at.surah === timing.surah) set({ at: { surah: timing.surah, verse: v } });
  }
  // Near the end of a surah file, have the next one ready in the other deck.
  if (wholeSurah() && Number.isFinite(a.duration) && a.duration - t < 25 && primedSurah !== state.at.surah) {
    primedSurah = state.at.surah;
    const next = nextSurahRef(state.at, state.repeat);
    if (next && !state.repeat) void load(1 - live, next);
  }
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
  if (wholeSurah()) return;
  const next = nextRef(state.at, state.repeat);
  if (next) void load(1 - live, next);
}

function playLive(): void {
  const d = decksReady();
  if (!d) return;
  const a = d[live];
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
  const loop = state.loop;
  // Per-ayah loop: the last verse of the loop ended.
  if (loop && !wholeSurah() && sameRef(state.at, loop.to)) {
    const more = loop.times === null || loop.done + 1 < loop.times;
    if (more) {
      set({ loop: { ...loop, done: loop.done + 1 } });
      seek(loop.from, true);
      return;
    }
    set({ loop: null });
    if (loop.then === "stop") {
      set({ playing: false });
      return;
    }
  }
  const next = wholeSurah() ? nextSurahRef(state.at, state.repeat) : nextRef(state.at, state.repeat);
  if (!next) {
    set({ playing: false });
    return;
  }
  const other = 1 - live;
  if (sameRef(armed[other], next)) {
    // The usual path: the file is already there, so the swap makes no gap.
    live = other;
    set({ at: next });
    playLive();
  } else {
    // Repeat was switched on mid-ayah, or loading is still catching up. The
    // status shows next to the button; the button itself stays play/pause.
    set({ at: next, status: "loading" });
    void load(live, next).then(() => state.playing && playLive());
  }
  primeNext();
}

// ── Commands ───────────────────────────────────────────────────────────────

/** Jump to an ayah, keeping playing if we were. Called by the picker too. */
export function seek(at: Ref, alsoPlay?: boolean): void {
  // A surah file without timings has no verse offsets inside it.
  const verse = modeNow() === "file" ? 1 : Math.max(1, Math.min(ayatIn(at.surah) || 1, at.verse));
  const target = { surah: at.surah, verse };
  if (sameRef(state.at, target) && !alsoPlay && wanted[live]) return;
  const d = decksReady();
  // A jump inside the surah file already playing is just a seek: no reload.
  const timing = deckTiming[live];
  if (d && timing && timing.surah === target.surah && state.mode === "surah" && armed[live]) {
    d[live].currentTime = verseStart(timing.verses, target.verse);
    set({ at: target });
    if (alsoPlay && !state.playing) {
      unlock();
      set({ playing: true });
      playLive();
    }
    return;
  }
  set({ at: target, status: d ? "loading" : "idle", mode: modeNow() });
  if (!d) return;
  d[1 - live].pause();
  void load(live, target).then(() => {
    if (state.playing || alsoPlay) playLive();
    else set({ status: "idle" });
    primeNext();
  });
  if (alsoPlay && !state.playing) {
    unlock();
    set({ playing: true });
  }
}

/** Start playing, from the current ayah. Must be called inside a tap on iOS. */
export function play(): void {
  unlock();
  const d = decksReady();
  set({ playing: true, mode: modeNow() });
  if (!d) return;
  if (armed[live] && (sameRef(armed[live], state.at) || (deckTiming[live]?.surah === state.at.surah && state.mode === "surah"))) {
    playLive();
  } else {
    set({ status: "loading" });
    void load(live, state.at).then(() => state.playing && playLive());
  }
  primeNext();
}

export function pause(): void {
  set({ playing: false, status: "idle" });
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
  const n = modeNow() === "file" ? nextSurahRef(state.at, false) : nextRef(state.at, false);
  if (n) seek(n);
}

export function previous(): void {
  const p = modeNow() === "file" ? prevSurahRef(state.at) : prevRef(state.at);
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
  seek(a, true);
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
  primedSurah = 0;
  token[0]++;
  token[1]++;
  const d = decksReady();
  set({ mode: modeNow() });
  if (!d) return;
  d[1 - live].pause();
  // Switching to (or from) a surah file without timings changes what a position means.
  const at = modeNow() === "file" ? { surah: state.at.surah, verse: 1 } : state.at;
  set({ at, status: state.playing ? "loading" : "idle" });
  void load(live, at).then(() => {
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
  return decks ? deckTiming[live] : null;
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
