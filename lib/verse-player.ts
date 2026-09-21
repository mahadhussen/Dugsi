// One shared verse player, so tapping an ayah marker anywhere plays that verse
// in the chosen Sheikh's voice and stops whatever else was playing.

import { useSyncExternalStore } from "react";
import { ayahAudioUrl } from "./audio-quran";
import { getSelectedReciterId } from "./reciter-store";

let audio: HTMLAudioElement | null = null;
let playingKey: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const verseKey = (surah: number, verse: number) => `${surah}:${verse}`;

export function stopVerse(): void {
  if (audio) {
    audio.pause();
    audio = null;
  }
  if (playingKey !== null) {
    playingKey = null;
    notify();
  }
}

/** Toggle playback of one verse. */
export function toggleVerse(surah: number, verse: number): void {
  const key = verseKey(surah, verse);
  if (playingKey === key) return stopVerse();
  stopVerse();
  const a = new Audio(ayahAudioUrl(surah, verse, getSelectedReciterId()));
  a.onended = () => {
    if (audio === a) stopVerse();
  };
  a.onerror = () => {
    if (audio === a) stopVerse();
  };
  audio = a;
  playingKey = key;
  notify();
  void a.play().catch(() => stopVerse());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The verse currently playing (via the marker), or null. */
export function usePlayingVerse(): string | null {
  return useSyncExternalStore(subscribe, () => playingKey, () => null);
}
