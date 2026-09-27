// Whole-surah recitations, from mp3quran.net.
//
// Most qaris Dugsi offers were published ayah by ayah, which is what lets the
// player buffer the next verse and light up words. A few — Sheikh Al Zain
// Mohammad Ahmad among them — were only ever recorded as one file per surah.
// Rather than hardcode a download server (they are numbered, they move, and a
// wrong guess is silent failure), we ask mp3quran.net's public catalogue once,
// on the listener's own device, and remember the answer for a month. That way
// the address always comes from the source itself.
//
// Everything here fails soft: no catalogue, no match, no server → null, and the
// player says the recitation could not be loaded instead of breaking.

import { getReciter, reciterSource, type Reciter } from "./audio-quran";

const API = "https://mp3quran.net/api/v3/reciters?language=ar";
const CACHE_KEY = "dugsi:mp3quran:v1";
const TTL = 30 * 86_400_000; // a month

/** A reciter's resolved recordings: where they live, and which surahs exist. */
export interface Moshaf {
  /** Folder URL the surah files sit in, always https and always trailing-slashed. */
  server: string;
  /** Surah numbers the recording covers, or null when the catalogue doesn't say. */
  surahs: number[] | null;
}

// ── Arabic name matching ───────────────────────────────────────────────────

/**
 * Arabic spelling varies in ways that don't change the name: harakat, tatweel,
 * hamza on the alef, ya vs alef maqsura. Strip all of that before comparing so
 * "الزين محمد أحمد" matches "الزين محمد احمد".
 */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, "") // harakat & marks
    .replace(/ـ/g, "") // tatweel
    .replace(/[آأإٱ]/g, "ا") // آ إ أ ٱ → ا
    .replace(/ى/g, "ي") // ى → ي
    .replace(/ة/g, "ه") // ة → ه
    .replace(/\s+/g, " ")
    .trim();
}

/** The same name without its definite articles, for a looser second pass. */
function withoutArticles(s: string): string {
  return s.replace(/\bال/g, "").replace(/\s+/g, " ").trim();
}

// ── Catalogue parsing ──────────────────────────────────────────────────────

interface RawMoshaf {
  name?: unknown;
  server?: unknown;
  surah_total?: unknown;
  surah_list?: unknown;
}

interface RawReciter {
  id?: unknown;
  name?: unknown;
  moshaf?: unknown;
}

/** mp3quran wraps the list in `reciters`; accept a bare array too. */
export function readCatalogue(payload: unknown): RawReciter[] {
  if (Array.isArray(payload)) return payload as RawReciter[];
  const wrapped = (payload as { reciters?: unknown } | null)?.reciters;
  return Array.isArray(wrapped) ? (wrapped as RawReciter[]) : [];
}

/** Find one reciter by their mp3quran id, else by (normalized) Arabic name. */
export function findReciter(list: RawReciter[], arabicName: string, id?: number): RawReciter | null {
  if (id !== undefined) {
    const byId = list.find((r) => Number(r.id) === id);
    if (byId) return byId;
  }
  const want = normalizeArabic(arabicName);
  const named = list.filter((r) => typeof r.name === "string");
  const exact = named.find((r) => normalizeArabic(r.name as string) === want);
  if (exact) return exact;
  const loose = withoutArticles(want);
  return (
    named.find((r) => withoutArticles(normalizeArabic(r.name as string)) === loose) ??
    named.find((r) => normalizeArabic(r.name as string).includes(want)) ??
    null
  );
}

const asSurahList = (raw: unknown): number[] | null => {
  const parts =
    typeof raw === "string" ? raw.split(",") : Array.isArray(raw) ? raw.map((x) => String(x)) : null;
  if (!parts) return null;
  const nums = parts.map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 114);
  return nums.length ? nums : null;
};

/**
 * A reciter can have several recordings (riwayat, murattal vs mujawwad). Dugsi
 * shows Hafs ʿan ʿĀṣim, so prefer a Hafs murattal mus'haf, then the most
 * complete one — never one without a server.
 */
export function pickMoshaf(reciter: RawReciter): Moshaf | null {
  const list = Array.isArray(reciter.moshaf) ? (reciter.moshaf as RawMoshaf[]) : [];
  const usable = list.filter((m) => typeof m.server === "string" && (m.server as string).trim() !== "");
  if (usable.length === 0) return null;

  const score = (m: RawMoshaf): number => {
    const name = typeof m.name === "string" ? m.name : "";
    let n = Number(m.surah_total);
    if (!Number.isFinite(n)) n = asSurahList(m.surah_list)?.length ?? 0;
    return (/حفص/.test(name) ? 400 : 0) + (/مرتل/.test(name) ? 200 : 0) + Math.min(n, 114);
  };
  const best = usable.reduce((a, b) => (score(b) > score(a) ? b : a));
  return { server: normalizeServer(best.server as string), surahs: asSurahList(best.surah_list) };
}

/**
 * Dugsi is served over https, so an http address would be blocked as mixed
 * content — upgrade it. A trailing slash keeps URL building trivial.
 */
export function normalizeServer(server: string): string {
  const https = server.trim().replace(/^http:\/\//i, "https://");
  return https.endsWith("/") ? https : `${https}/`;
}

/** Where one surah's recording sits: 001.mp3 … 114.mp3 under the server folder. */
export function buildSurahUrl(server: string, surah: number): string {
  return `${normalizeServer(server)}${String(surah).padStart(3, "0")}.mp3`;
}

// ── Lookup, cached on the device ───────────────────────────────────────────

interface Entry extends Moshaf {
  at: number;
}

let memory: Record<string, Entry> | null = null;
const inflight = new Map<string, Promise<Moshaf | null>>();

function readCache(): Record<string, Entry> {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, Entry>;
  } catch {
    memory = {};
  }
  return memory;
}

function writeCache(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memory ?? {}));
  } catch {
    // Private mode or a full quota — we just look it up again next time.
  }
}

/** Forget the remembered servers (used when a recitation refuses to play). */
export function forgetResolved(reciterId?: string): void {
  if (!reciterId) {
    memory = {};
  } else {
    const cache = readCache();
    delete cache[reciterId];
  }
  writeCache();
}

async function lookup(reciter: Reciter): Promise<Moshaf | null> {
  const match = reciter.mp3quran;
  if (!match) return null;
  try {
    const res = await fetch(API, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const found = findReciter(readCatalogue(await res.json()), match.arabicName, match.id);
    return found ? pickMoshaf(found) : null;
  } catch {
    // Offline, blocked by CORS, or the shape changed — fall through to null.
    return null;
  }
}

/** The reciter's recordings, from the cache when we already asked. */
export async function resolveMoshaf(reciterId: string): Promise<Moshaf | null> {
  const reciter = getReciter(reciterId);
  if (reciterSource(reciter) !== "mp3quran") return null;
  if (typeof window === "undefined") return null;

  const cached = readCache()[reciter.id];
  if (cached && Date.now() - cached.at < TTL) return { server: cached.server, surahs: cached.surahs };

  let p = inflight.get(reciter.id);
  if (!p) {
    p = lookup(reciter)
      .then((m) => {
        if (m) {
          readCache()[reciter.id] = { ...m, at: Date.now() };
          writeCache();
        }
        return m;
      })
      .finally(() => inflight.delete(reciter.id));
    inflight.set(reciter.id, p);
  }
  return p;
}

/**
 * The file that holds this whole surah in this Sheikh's voice, or null when the
 * catalogue cannot be reached or he never recorded that surah.
 */
export async function surahAudioUrl(reciterId: string, surah: number): Promise<string | null> {
  const moshaf = await resolveMoshaf(reciterId);
  if (!moshaf) return null;
  if (moshaf.surahs && !moshaf.surahs.includes(surah)) return null;
  return buildSurahUrl(moshaf.server, surah);
}
