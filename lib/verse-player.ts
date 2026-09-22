// One shared verse player, so tapping an ayah marker anywhere plays that verse
// in the chosen Sheikh's voice and stops whatever else was playing.

import { useSyncExternalStore } from "react";
import { ayahAudioUrl } from "./audio-quran";
import { playableUrl } from "./audio-cache";
import { pause as pauseListening } from "./listen-engine";
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

/** Toggle playback of one verse. Plays from the device when the surah is saved. */
export function toggleVerse(surah: number, verse: number): void {
  const key = verseKey(surah, verse);
  if (playingKey === key) return stopVerse();
  stopVerse();
  // One verse on its own and a continuous recitation are two different things;
  // only one of them should be sounding.
  pauseListening();
  const url = ayahAudioUrl(surah, verse, getSelectedReciterId());
  const a = new Audio();
  a.onended = () => {
    if (audio === a) stopVerse();
  };
  a.onerror = () => {
    if (audio === a) stopVerse();
  };
  audio = a;
  playingKey = key;
  notify();
  void playableUrl(url).then((src) => {
    if (audio !== a) return; // stopped, or another verse started, while we looked
    a.src = src;
    void a.play().catch(() => {
      if (audio === a) stopVerse();
    });
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The verse currently playing (via the marker), or null. */
export function usePlayingVerse(): string | null {
  return useSyncExternalStore(subscribe, () => playingKey, () => null);
}
