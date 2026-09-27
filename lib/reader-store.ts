// Where the reader is right now (surah + verse), shared with the top bar so it
// can show "Chapter At-Tin · Chapter 95 | Verse 4" and offer prev/next.

import { useSyncExternalStore } from "react";

export interface ReaderPosition {
  surah: number;
  verse: number;
  /** Page of the printed Madinah mushaf, when known. */
  page?: number;
}

let current: ReaderPosition = { surah: 1, verse: 1, page: 1 };
const listeners = new Set<() => void>();

export function setReaderPosition(surah: number, verse: number, page?: number): void {
  if (current.surah === surah && current.verse === verse && (page === undefined || current.page === page)) return;
  current = { surah, verse, page: page ?? current.page };
  listeners.forEach((l) => l());
}

export function getReaderPosition(): ReaderPosition {
  return current;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const SERVER: ReaderPosition = { surah: 1, verse: 1, page: 1 };

export function useReaderPosition(): ReaderPosition {
  return useSyncExternalStore(subscribe, getReaderPosition, () => SERVER);
}
