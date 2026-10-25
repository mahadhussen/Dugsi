// One recording per surah, with where each verse starts and ends in it.
//
// Why: playing a surah as one file means nothing has to load between verses,
// so there is no pause between them on any phone (per-verse files paused at
// every verse on iPhone, which does not load the next file ahead). mp3quran.net
// publishes these verse timings for 115 complete recordings in a documented
// public API (/api/v3/ayat_timing), read here on the listener's device.
//
// Each Sheikh is tied to one exact recording id (Hafs, the same style as the
// catalogue entry), checked by hand against their list on 2026-10-25 — never
// matched by name at run time, where a near-miss would mean the wrong voice.

const API = "https://www.mp3quran.net/api/v3/ayat_timing";
const CACHE = "dugsi:surah-timing:v1";
const TTL = 30 * 86_400_000;

/** Dugsi reciter id → mp3quran timed recording ("read") id. */
export const TIMED_READS: Record<string, number> = {
  alafasy: 123,
  husary: 118,
  husary_mujawwad: 119,
  abdulbasit: 53,
  abdulbasit_mujawwad: 51,
  minshawi: 112,
  sudais: 54,
  shuraim: 31,
  ghamdi: 30,
  dossari: 92,
  hudhaify: 74,
  ayyoub: 109,
  basfar: 60,
  shatri: 4,
  ajmi: 5,
  budair: 43,
  qasim: 67,
  qatami: 86,
  qahtani: 21,
  juhany: 62,
  bukhatir: 46,
  tunaiji: 24,
  jaber: 76,
  abdulkareem: 115,
  alzain: 13,
  tablawi: 106,
  akhdar: 1,
  rifai: 89,
  abbad: 81,
  yassin: 32,
  suesy: 77,
  alaqimy: 10,
  rifai_nabil: 87,
};

export interface VerseSpan {
  verse: number;
  /** Seconds in the surah's recording. */
  start: number;
  end: number;
}

export interface SurahTiming {
  read: number;
  surah: number;
  url: string;
  verses: VerseSpan[];
}

export function hasSurahTiming(reciterId: string): boolean {
  return reciterId in TIMED_READS;
}

/**
 * Validate the API's timing rows for one surah. Returns null unless every
 * verse 1..ayahCount is there once, in order, with sane times — a timing we
 * cannot trust would jump to the wrong verse, which is worse than none.
 */
export function parseTimings(raw: unknown, ayahCount: number): VerseSpan[] | null {
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .filter((r): r is { ayah: number; start_time: number; end_time: number } =>
      !!r && typeof r === "object" && typeof (r as { ayah?: unknown }).ayah === "number",
    )
    .filter((r) => r.ayah >= 1)
    .sort((a, b) => a.ayah - b.ayah);
  if (rows.length !== ayahCount) return null;
  const out: VerseSpan[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const start = Number(r.start_time) / 1000;
    const end = Number(r.end_time) / 1000;
    if (r.ayah !== i + 1 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    if (i > 0 && start < out[i - 1].start) return null;
    out.push({ verse: r.ayah, start, end });
  }
  return out;
}

/** The verse sounding at `t` seconds (binary search). */
export function verseAt(verses: VerseSpan[], t: number): number {
  if (!verses.length) return 1;
  let lo = 0;
  let hi = verses.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (verses[mid].start <= t + 0.05) lo = mid;
    else hi = mid - 1;
  }
  return verses[lo].verse;
}

/** Where a verse begins: verse 1 begins at the top, so the opening
 *  isti'adha and basmala are heard when a surah is played from its start. */
export function verseStart(verses: VerseSpan[], verse: number): number {
  if (verse <= 1) return 0;
  return verses[verse - 1]?.start ?? 0;
}

export function verseEnd(verses: VerseSpan[], verse: number): number {
  return verses[verse - 1]?.end ?? Infinity;
}

// ── Fetching (cached on the device) ────────────────────────────────────────

interface Cached {
  at: number;
  folders?: Record<number, string>;
  surahs?: Record<string, VerseSpan[]>;
}

function readCache(): Cached {
  try {
    const raw = localStorage.getItem(CACHE);
    const c = raw ? (JSON.parse(raw) as Cached) : null;
    if (c && Date.now() - c.at < TTL) return c;
  } catch {
    /* no storage */
  }
  return { at: Date.now() };
}
function writeCache(c: Cached) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(c));
  } catch {
    /* quota: fine, we just fetch again */
  }
}

let foldersPromise: Promise<Record<number, string> | null> | null = null;

async function folders(): Promise<Record<number, string> | null> {
  const c = readCache();
  if (c.folders) return c.folders;
  if (!foldersPromise) {
    foldersPromise = fetch(`${API}/reads`)
      .then((r) => (r.ok ? r.json() : null))
      .then((list: unknown) => {
        if (!Array.isArray(list)) return null;
        const map: Record<number, string> = {};
        for (const r of list as { id?: unknown; folder_url?: unknown }[]) {
          if (typeof r.id === "number" && typeof r.folder_url === "string" && /^https:\/\//.test(r.folder_url)) {
            map[r.id] = r.folder_url.endsWith("/") ? r.folder_url : `${r.folder_url}/`;
          }
        }
        const fresh = readCache();
        writeCache({ ...fresh, folders: map });
        return map;
      })
      .catch(() => null)
      .finally(() => {
        foldersPromise = null;
      });
  }
  return foldersPromise;
}

const memo = new Map<string, Promise<SurahTiming | null>>();

/** The surah's recording and verse timings for this Sheikh, or null. */
export function loadSurahTiming(reciterId: string, surah: number, ayahCount: number): Promise<SurahTiming | null> {
  const read = TIMED_READS[reciterId];
  if (!read || typeof window === "undefined") return Promise.resolve(null);
  const key = `${read}:${surah}`;
  let p = memo.get(key);
  if (!p) {
    p = (async () => {
      const dirs = await folders();
      const folder = dirs?.[read];
      if (!folder) return null;
      const url = `${folder}${String(surah).padStart(3, "0")}.mp3`;
      const cached = readCache().surahs?.[key];
      if (cached && cached.length === ayahCount) return { read, surah, url, verses: cached };
      const res = await fetch(`${API}?surah=${surah}&read=${read}`).catch(() => null);
      const raw = res && res.ok ? await res.json().catch(() => null) : null;
      const verses = parseTimings(raw, ayahCount);
      if (!verses) return null;
      const c = readCache();
      writeCache({ ...c, surahs: { ...(c.surahs ?? {}), [key]: verses } });
      return { read, surah, url, verses };
    })().catch(() => null);
    memo.set(key, p);
    p.then((v) => v === null && memo.delete(key));
  }
  return p;
}
