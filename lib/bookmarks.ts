// Verse bookmarks — local first, synced to the account when signed in.
//
// Local storage keeps the list plus tombstones for removals, so a bookmark
// deleted here is also deleted in the cloud on the next sync instead of coming
// back from another device.

import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase/client";

export interface Bookmark {
  surah: number;
  verse: number;
  created_at: string;
}

interface Store {
  items: Bookmark[];
  /** "surah:verse" keys removed locally but maybe not yet in the cloud. */
  removed: string[];
}

const KEY = "dugsi:bookmarks:v1";
const EMPTY: Store = { items: [], removed: [] };
let cache: Store | null = null;
let snapshot: Bookmark[] = [];
const listeners = new Set<() => void>();

export const bookmarkKey = (surah: number, verse: number) => `${surah}:${verse}`;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function read(): Store {
  if (cache) return cache;
  try {
    const raw = storage()?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Store) : EMPTY;
    cache = {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      removed: Array.isArray(parsed.removed) ? parsed.removed : [],
    };
  } catch {
    cache = { items: [], removed: [] };
  }
  snapshot = sortBookmarks(cache.items);
  return cache;
}

function write(next: Store): void {
  cache = next;
  snapshot = sortBookmarks(next.items);
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function sortBookmarks(items: Bookmark[]): Bookmark[] {
  return [...items].sort((a, b) => a.surah - b.surah || a.verse - b.verse);
}

export function listBookmarks(): Bookmark[] {
  read();
  return snapshot;
}

export function isBookmarked(surah: number, verse: number): boolean {
  return read().items.some((b) => b.surah === surah && b.verse === verse);
}

export function toggleBookmark(surah: number, verse: number, userId: string | null = null): boolean {
  const cur = read();
  const key = bookmarkKey(surah, verse);
  const exists = cur.items.some((b) => b.surah === surah && b.verse === verse);
  let next: Store;
  if (exists) {
    next = {
      items: cur.items.filter((b) => !(b.surah === surah && b.verse === verse)),
      removed: Array.from(new Set([...cur.removed, key])),
    };
  } else {
    next = {
      items: [...cur.items, { surah, verse, created_at: new Date().toISOString() }],
      removed: cur.removed.filter((k) => k !== key),
    };
  }
  write(next);
  if (userId) void syncBookmarks(userId);
  return !exists;
}

/** Push local adds/removes, then pull the account's list. */
export async function syncBookmarks(userId: string): Promise<Bookmark[]> {
  const supabase = getSupabase();
  const local = read();
  if (!supabase) return snapshot;
  try {
    if (local.removed.length > 0) {
      for (const key of local.removed) {
        const [s, v] = key.split(":").map(Number);
        await supabase.from("bookmarks").delete().eq("user_id", userId).eq("surah", s).eq("verse", v);
      }
    }
    if (local.items.length > 0) {
      await supabase
        .from("bookmarks")
        .upsert(
          local.items.map((b) => ({ user_id: userId, surah: b.surah, verse: b.verse, created_at: b.created_at })),
          { onConflict: "user_id,surah,verse", ignoreDuplicates: true },
        );
    }
    const { data, error } = await supabase.from("bookmarks").select("surah, verse, created_at").eq("user_id", userId);
    if (!error && data) {
      write({ items: data as Bookmark[], removed: [] });
    }
  } catch {
    /* offline — keep local */
  }
  return snapshot;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const SERVER_EMPTY: Bookmark[] = [];

/** React hook: the live bookmark list. */
export function useBookmarks(): Bookmark[] {
  return useSyncExternalStore(subscribe, listBookmarks, () => SERVER_EMPTY);
}
