// Favourite and recently used reciters, kept on the device.

import { useSyncExternalStore } from "react";

const FAV_KEY = "dugsi:reciters:favourites";
const RECENT_KEY = "dugsi:reciters:recent";
const MAX_RECENT = 6;

interface Prefs {
  favourites: string[];
  recent: string[];
}

let cache: Prefs | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function readList(key: string): string[] {
  try {
    const raw = storage()?.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function read(): Prefs {
  if (!cache) cache = { favourites: readList(FAV_KEY), recent: readList(RECENT_KEY) };
  return cache;
}

function write(next: Prefs): void {
  cache = next;
  try {
    storage()?.setItem(FAV_KEY, JSON.stringify(next.favourites));
    storage()?.setItem(RECENT_KEY, JSON.stringify(next.recent));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function toggleFavouriteReciter(id: string): void {
  const cur = read();
  const favourites = cur.favourites.includes(id) ? cur.favourites.filter((x) => x !== id) : [...cur.favourites, id];
  write({ ...cur, favourites });
}

export function noteRecentReciter(id: string): void {
  const cur = read();
  const recent = [id, ...cur.recent.filter((x) => x !== id)].slice(0, MAX_RECENT);
  if (recent.join() === cur.recent.join()) return;
  write({ ...cur, recent });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const SERVER: Prefs = { favourites: [], recent: [] };

export function useReciterPrefs(): Prefs {
  return useSyncExternalStore(subscribe, read, () => SERVER);
}
