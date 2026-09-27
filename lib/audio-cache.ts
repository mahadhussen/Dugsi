// Keeping the Sheikh's recitation on the device.
//
// Every ayah is a small mp3 on everyayah.com. Streaming them one at a time is
// what made playback stutter: the next ayah only started downloading once the
// previous one had finished. Two things fix that — priming the next ayah while
// the current one plays (lib/listen-engine.ts) and, for good, keeping the files
// in the browser's Cache Storage so a surah you have saved plays with no
// network at all, on a train or on aeroplane mode.
//
// The files are the reciters' own recordings, saved by the listener's own
// browser, exactly like any page you visit offline. Nothing is bundled into the
// app and nothing is re-hosted.

import { ayahAudioUrl } from "./audio-quran";
import { surahMeta } from "./quran";

const CACHE_NAME = "dugsi-audio-v1";

/** Cache Storage, or null where it isn't available (old browsers, private mode). */
function store(): CacheStorage | null {
  try {
    return typeof caches !== "undefined" ? caches : null;
  } catch {
    return null;
  }
}

export function audioCacheSupported(): boolean {
  return store() !== null;
}

let cachePromise: Promise<Cache | null> | null = null;
function openCache(): Promise<Cache | null> {
  if (!cachePromise) {
    const s = store();
    cachePromise = s ? s.open(CACHE_NAME).catch(() => null) : Promise.resolve(null);
  }
  return cachePromise;
}

/** Every ayah URL of one surah in one Sheikh's voice, in order. */
export function surahAyahUrls(surah: number, reciterId: string): string[] {
  const meta = surahMeta(surah);
  if (!meta) return [];
  const urls: string[] = [];
  for (let a = 1; a <= meta.ayahCount; a++) urls.push(ayahAudioUrl(surah, a, reciterId));
  return urls;
}

// Blob URLs for files we play from the cache. A handful is enough — the player
// only ever holds the current ayah and the next one or two — and the oldest is
// released as new ones are made, so memory stays flat.
const BLOB_LIMIT = 8;
const blobs = new Map<string, string>();

function rememberBlob(url: string, blobUrl: string): string {
  blobs.set(url, blobUrl);
  while (blobs.size > BLOB_LIMIT) {
    const oldest = blobs.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const stale = blobs.get(oldest);
    blobs.delete(oldest);
    if (stale) URL.revokeObjectURL(stale);
  }
  return blobUrl;
}

/**
 * What the <audio> element should load for this ayah: a local blob when the
 * file is saved on the device, the original URL otherwise. Never throws — a
 * cache miss just means we stream it.
 */
export async function playableUrl(url: string): Promise<string> {
  const known = blobs.get(url);
  if (known) return known;
  try {
    const cache = await openCache();
    const hit = await cache?.match(url);
    if (!hit) return url;
    return rememberBlob(url, URL.createObjectURL(await hit.blob()));
  } catch {
    return url;
  }
}

/** True when this exact file is already on the device. */
export async function isSaved(url: string): Promise<boolean> {
  try {
    const cache = await openCache();
    return (await cache?.match(url)) !== undefined;
  } catch {
    return false;
  }
}

/** How many of a surah's ayat are saved in this Sheikh's voice. */
export async function savedCount(surah: number, reciterId: string): Promise<number> {
  const cache = await openCache();
  if (!cache) return 0;
  const urls = surahAyahUrls(surah, reciterId);
  let n = 0;
  await Promise.all(urls.map(async (u) => void ((await cache.match(u)) && n++)));
  return n;
}

export interface SaveProgress {
  /** Ayat saved so far. */
  done: number;
  /** Ayat in the surah. */
  total: number;
}

/**
 * Save a whole surah in one Sheikh's voice. Downloads a few ayat at a time so
 * the phone stays responsive, skips what is already there, and reports progress
 * as it goes. Resolves to the number of ayat saved; stops early if aborted.
 */
export async function saveSurah(
  surah: number,
  reciterId: string,
  onProgress?: (p: SaveProgress) => void,
  signal?: AbortSignal,
): Promise<number> {
  const cache = await openCache();
  const urls = surahAyahUrls(surah, reciterId);
  const total = urls.length;
  if (!cache || total === 0) return 0;

  let done = 0;
  let next = 0;
  const report = () => onProgress?.({ done, total });
  report();

  const worker = async (): Promise<void> => {
    while (next < total) {
      if (signal?.aborted) return;
      const url = urls[next++];
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { signal });
          // Opaque or failed responses are not worth keeping — we'd cache a
          // "file" that can never be played.
          if (res.ok && res.type !== "opaque") await cache.put(url, res.clone());
        }
        done++;
      } catch {
        // One missing ayah shouldn't fail the whole surah; it simply streams.
      }
      report();
    }
  };

  await Promise.all([worker(), worker(), worker(), worker()]);
  return done;
}

/** Forget a saved surah, freeing the space it used. */
export async function forgetSurah(surah: number, reciterId: string): Promise<void> {
  const cache = await openCache();
  if (!cache) return;
  await Promise.all(
    surahAyahUrls(surah, reciterId).map(async (u) => {
      const blob = blobs.get(u);
      if (blob) {
        blobs.delete(u);
        URL.revokeObjectURL(blob);
      }
      await cache.delete(u);
    }),
  );
}

/** Forget every saved recitation. */
export async function clearAudioCache(): Promise<void> {
  for (const [, blob] of blobs) URL.revokeObjectURL(blob);
  blobs.clear();
  cachePromise = null;
  try {
    await store()?.delete(CACHE_NAME);
  } catch {
    // Nothing saved, or storage is unavailable — nothing to do.
  }
}

/** Roughly how much room saved recitations take, in bytes, or null if unknown. */
export async function savedBytes(): Promise<number | null> {
  const cache = await openCache();
  if (!cache) return null;
  try {
    const keys = await cache.keys();
    let bytes = 0;
    for (const req of keys) {
      const res = await cache.match(req);
      const len = res?.headers.get("content-length");
      bytes += len ? Number(len) : 0;
    }
    return bytes;
  } catch {
    return null;
  }
}
