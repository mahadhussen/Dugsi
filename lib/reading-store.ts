// What the reader is set to: the surah, an optional verse range to practise,
// and whether we are listening or reciting. Chosen on the home page, used on
// the Quran page, remembered on the device.

import { useSyncExternalStore } from "react";

export type Mode = "listen" | "recite";
export interface Range {
  from: number;
  to: number;
}
export interface Reading {
  surah: number;
  range: Range | null;
  mode: Mode;
  /** Verse to open at (a bookmark, a mistake to practise); cleared once used. */
  verse?: number;
}

const KEY = "dugsi:reading:v1";
const listeners = new Set<() => void>();
let cache: Reading | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function read(): Reading {
  if (cache) return cache;
  let r: Reading = { surah: 1, range: null, mode: "recite" };
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<Reading>;
      if (typeof j.surah === "number" && j.surah >= 1 && j.surah <= 114) r.surah = j.surah;
      if (j.mode === "listen" || j.mode === "recite") r.mode = j.mode;
    }
  } catch {
    /* ignore */
  }
  cache = r;
  return r;
}

function write(next: Reading): void {
  cache = next;
  try {
    storage()?.setItem(KEY, JSON.stringify({ surah: next.surah, mode: next.mode }));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getReading(): Reading {
  return read();
}

export function setReading(patch: Partial<Reading>): void {
  const cur = read();
  const next = { ...cur, ...patch };
  if (patch.surah !== undefined && patch.surah !== cur.surah && patch.range === undefined) next.range = null;
  write(next);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const SERVER: Reading = { surah: 1, range: null, mode: "recite" };

export function useReading(): Reading {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}
