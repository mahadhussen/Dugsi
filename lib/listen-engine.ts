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
// So playback lives here instead, outside React, in a pair of audio elements.
// One plays while the other quietly loads the ayah after it (across the surah
// boundary too), and at the end they simply swap: the next ayah is already
// buffered, so it starts in the same tick. The reader follows along afterwards;
// it can take its time without the recitation waiting for it.

import { ayahAudioUrl } from "./audio-quran";
import { playableUrl } from "./audio-cache";
import { surahMeta } from "./quran";
import { loadTimings } from "./quran/timings";
import { useSyncExternalStore } from "react";

export interface Ref {
  surah: number;
  verse: number;
}

export type Status = "idle" | "loading" | "error";

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

// ── State ──────────────────────────────────────────────────────────────────

let state: ListenState = { at: { surah: 1, verse: 1 }, playing: false, status: "idle", rate: 1, repeat: false };
let reciterId = "alafasy";
const listeners = new Set<() => void>();

function set(patch: Partial<ListenState>): void {
  const next = { ...state, ...patch };
  if (
    next.playing === state.playing &&
    next.status === state.status &&
    next.rate === state.rate &&
    next.repeat === state.repeat &&
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
 *  token so a slow load can never overwrite a newer one. */
const wanted: (Ref | null)[] = [null, null];
const armed: (Ref | null)[] = [null, null];
const token = [0, 0];
let unlocked = false;

function decksReady(): [HTMLAudioElement, HTMLAudioElement] | null {
  if (decks) return decks;
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  const make = (i: number) => {
    const a = new Audio();
    a.preload = "auto";
    a.addEventListener("ended", () => {
      if (decks && decks[live] === a) advance();
    });
    a.addEventListener("playing", () => {
      if (decks && decks[live] === a) set({ status: "idle" });
    });
    a.addEventListener("waiting", () => {
      if (decks && decks[live] === a) set({ status: "loading" });
    });
    a.addEventListener("error", () => {
      if (decks && decks[live] === a && state.playing) set({ status: "error" });
    });
    return a;
  };
  decks = [make(0), make(1)];
  return decks;
}

/**
 * iOS only lets an audio element play after a user has touched it, and the
 * touch unlocks that one element. Since we play from two, we unlock both inside
 * the first tap — otherwise the very first swap would be silently refused.
 */
function unlock(): void {
  if (unlocked) return;
  const d = decksReady();
  if (!d) return;
  unlocked = true;
  for (const a of d) {
    if (a.src) continue;
    a.muted = true;
    void a
      .play()
      .then(() => {
        a.pause();
        a.muted = false;
      })
      .catch(() => {
        a.muted = false;
      });
  }
}

/** Load an ayah into a deck, from the device when it is saved there. */
async function load(deck: number, at: Ref): Promise<void> {
  const d = decksReady();
  if (!d) return;
  if (sameRef(wanted[deck], at)) return;
  const mine = ++token[deck];
  wanted[deck] = at;
  armed[deck] = null;
  // Warm the read-along timings for the surah we are heading into, so the words
  // keep lighting up across the boundary.
  void loadTimings(reciterId, at.surah);
  const src = await playableUrl(ayahAudioUrl(at.surah, at.verse, reciterId));
  if (token[deck] !== mine) return; // a newer load won
  d[deck].src = src;
  d[deck].playbackRate = state.rate;
  d[deck].load();
  armed[deck] = at;
}

/** Start the ayah after the current one loading, so the swap is instant. */
function primeNext(): void {
  const next = nextRef(state.at, state.repeat);
  if (next) void load(1 - live, next);
}

function playLive(): void {
  const d = decksReady();
  if (!d) return;
  const a = d[live];
  a.playbackRate = state.rate;
  a.play()
    .then(() => set({ status: "idle" }))
    .catch((err: unknown) => {
      // A rapid change of ayah aborts the previous play — that is expected.
      if ((err as { name?: string })?.name !== "AbortError" && state.playing) set({ status: "error" });
    });
}

/** The current ayah has ended: hand over to the deck that is already loaded. */
function advance(): void {
  const d = decksReady();
  if (!d) return;
  const next = nextRef(state.at, state.repeat);
  if (!next) {
    set({ playing: false });
    return;
  }
  const other = 1 - live;
  if (sameRef(armed[other], next)) {
    // The usual path: the file is buffered, so the swap makes no gap at all.
    live = other;
    set({ at: next });
    playLive();
  } else {
    // Repeat was switched on mid-ayah, or loading is still catching up.
    set({ at: next, status: "loading" });
    void load(live, next).then(() => state.playing && playLive());
  }
  primeNext();
}

// ── Commands ───────────────────────────────────────────────────────────────

/** Jump to an ayah, keeping playing if we were. Called by the picker too. */
export function seek(at: Ref, alsoPlay?: boolean): void {
  const verse = Math.max(1, Math.min(ayatIn(at.surah) || 1, at.verse));
  const target = { surah: at.surah, verse };
  if (sameRef(state.at, target) && !alsoPlay) return;
  const d = decksReady();
  set({ at: target, status: d ? "loading" : "idle" });
  if (!d) return;
  d[1 - live].pause();
  void load(live, target).then(() => {
    if (state.playing || alsoPlay) playLive();
    primeNext();
  });
  if (alsoPlay && !state.playing) set({ playing: true });
}

/** Start playing, from the current ayah. Must be called inside a tap on iOS. */
export function play(): void {
  unlock();
  const d = decksReady();
  set({ playing: true });
  if (!d) return;
  if (sameRef(armed[live], state.at)) {
    playLive();
  } else {
    set({ status: "loading" });
    void load(live, state.at).then(() => state.playing && playLive());
  }
  primeNext();
}

export function pause(): void {
  set({ playing: false, status: "idle" });
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
  const n = nextRef(state.at, false);
  if (n) seek(n);
}

export function previous(): void {
  const p = prevRef(state.at);
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
  primeNext(); // the ayah after the last one just changed
}

/** Switch Sheikh: the same ayah, in the new voice, still playing. */
export function setReciter(id: string): void {
  if (id === reciterId) return;
  reciterId = id;
  wanted[0] = wanted[1] = null;
  armed[0] = armed[1] = null;
  token[0]++;
  token[1]++;
  const d = decksReady();
  if (!d) return;
  d[1 - live].pause();
  set({ status: state.playing ? "loading" : "idle" });
  void load(live, state.at).then(() => {
    if (state.playing) playLive();
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
};

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
