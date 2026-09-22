// Word-level timestamps inside each qari's ayah recordings.
//
// Source: quran-align by Collin Fair (https://github.com/cpfair/quran-align),
// data licensed CC BY 4.0, generated against the same everyayah.com recordings
// Dugsi streams. Vendored per surah under ./timings/<reciterId>/<surah>.json as
// { "<ayah>": [[startMs, endMs], ...one per word...] }. Only ayat whose word
// segmentation matches Dugsi's text exactly were kept (99% of them); a missing
// ayah simply means "no word highlight there".

export type WordTimes = [number, number][];
export type SurahTimings = Record<string, WordTimes>;

/** Reciter ids (lib/audio-quran.ts) that have vendored word timings. */
export const TIMED_RECITERS = new Set(["alafasy", "husary_muallim", "shuraim", "minshawi"]);

export function hasWordTimings(reciterId: string): boolean {
  return TIMED_RECITERS.has(reciterId);
}

const cache = new Map<string, Promise<SurahTimings | null>>();

/** Word times for one surah in one reciter's voice, or null if none. */
export function loadTimings(reciterId: string, surah: number): Promise<SurahTimings | null> {
  if (!hasWordTimings(reciterId)) return Promise.resolve(null);
  const key = `${reciterId}/${surah}`;
  let p = cache.get(key);
  if (!p) {
    p = import(`./timings/${reciterId}/${surah}.json`)
      .then((m) => (m.default ?? m) as SurahTimings)
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** Index of the word being recited at `ms` into the ayah recording, or -1. */
export function wordAt(times: WordTimes | undefined, ms: number): number {
  if (!times || times.length === 0) return -1;
  // Words are in order; a linear scan is fine (ayat are short).
  for (let i = 0; i < times.length; i++) {
    const [s, e] = times[i];
    if (ms < s) return i === 0 ? -1 : i - 1; // in the gap before word i → still on the previous word
    if (ms <= e) return i;
  }
  return times.length - 1;
}
