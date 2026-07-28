// A tiny shared store for the qari (Sheikh) the listener has chosen. Kept in
// localStorage so the choice survives reloads, and broadcast to every component
// (play buttons, the picker, the listen player) via useSyncExternalStore so they
// stay in sync the moment the user switches reciter.

import { useSyncExternalStore } from "react";
import { DEFAULT_RECITER_ID, getReciter, type Reciter } from "./audio-quran";

const STORAGE_KEY = "dugsi:reciter";

let current: string = DEFAULT_RECITER_ID;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && getReciter(saved).id === saved) current = saved;
  } catch {
    // Private mode / storage disabled — keep the default.
  }
}

export function getSelectedReciterId(): string {
  hydrate();
  return current;
}

export function setSelectedReciterId(id: string) {
  const resolved = getReciter(id).id;
  if (resolved === current) return;
  current = resolved;
  try {
    window.localStorage.setItem(STORAGE_KEY, resolved);
  } catch {
    // Ignore storage failures — the choice still applies for this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  hydrate();
  listeners.add(cb);
  // Follow the choice across tabs.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue && e.newValue !== current) {
      current = getReciter(e.newValue).id;
      listeners.forEach((l) => l());
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** React hook: the currently selected reciter and a setter. */
export function useReciter(): { reciter: Reciter; reciterId: string; setReciterId: (id: string) => void } {
  const reciterId = useSyncExternalStore(subscribe, getSelectedReciterId, () => DEFAULT_RECITER_ID);
  return { reciter: getReciter(reciterId), reciterId, setReciterId: setSelectedReciterId };
}
