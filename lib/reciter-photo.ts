// Reciter portraits, fetched lazily from the English Wikipedia page summary
// (its REST API allows browser requests from any origin). The thumbnail is a
// Wikimedia Commons image under its own free licence; the picker links the
// portrait to the article, where the file's author and licence are listed.
// Anything that fails (no article, no image, offline) falls back to a monogram.

const CACHE_KEY = "dugsi:reciters:photos:v1";
const TTL = 30 * 86_400_000;

interface Entry {
  url: string | null;
  at: number;
}

let cache: Record<string, Entry> | null = null;
const inflight = new Map<string, Promise<string | null>>();

function load(): Record<string, Entry> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    cache = {};
  }
  return cache!;
}

function save(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache ?? {}));
  } catch {
    /* ignore */
  }
}

/** Cached portrait URL for an article, or undefined when not fetched yet. */
export function cachedPhoto(article: string): string | null | undefined {
  if (typeof window === "undefined") return undefined;
  const e = load()[article];
  if (!e || Date.now() - e.at > TTL) return undefined;
  return e.url;
}

/** Resolve (and cache) the portrait URL for a Wikipedia article title. */
export function fetchPhoto(article: string): Promise<string | null> {
  const hit = cachedPhoto(article);
  if (hit !== undefined) return Promise.resolve(hit);
  let p = inflight.get(article);
  if (!p) {
    p = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article)}`, {
      headers: { accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { thumbnail?: { source?: string } } | null) => {
        const url = j?.thumbnail?.source ?? null;
        load()[article] = { url, at: Date.now() };
        save();
        return url;
      })
      .catch(() => null)
      .finally(() => inflight.delete(article));
    inflight.set(article, p);
  }
  return p;
}
