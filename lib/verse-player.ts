// One shared verse player, so tapping an ayah marker anywhere plays that verse
// in the chosen Sheikh's voice and stops whatever else was playing.

import { useSyncExternalStore } from "react";
import { ayahAudioUrl } from "./audio-quran";
import { playableUrl } from "./audio-cache";
import { getListenState, onListenChange, pause as pauseListening, repeatRange, seek as seekListening, setReciter as setListenReciter } from "./listen-engine";
import { getSelectedReciterId } from "./reciter-store";
import { getReading } from "./reading-store";
import { hasSurahTiming } from "./listen/surah-timing";

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
  // Listening: a tapped verse is where the Sheikh carries on from.
  if (getReading().mode === "listen") {
    stopVerse();
    seekListening({ surah, verse }, true);
    return;
  }
  // A Sheikh recorded as whole surahs reads just this verse, in his own voice.
  const reciter = getSelectedReciterId();
  if (hasSurahTiming(reciter)) {
    const ls = getListenState();
    if (playingKey === key && ls.playing) {
      pauseListening();
      playingKey = null;
      notify();
      return;
    }
    stopVerse();
    setListenReciter(reciter);
    repeatRange({ surah, verse }, { surah, verse }, 1, "stop");
    playingKey = key;
    notify();
    // The marker shows "playing" until the Sheikh has read the verse.
    const off = onListenChange(() => {
      if (getListenState().playing) return;
      off();
      if (playingKey === key) {
        playingKey = null;
        notify();
      }
    });
    return;
  }
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
