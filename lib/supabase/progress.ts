// Per-user progress & session history.
//
// When the reader is signed in, reading position and recitation sessions are
// stored in Supabase (and so follow them to any device). When signed out we keep
// the old behaviour: furthest verse in this device's localStorage, no history.

import { getSupabase } from "./client";
import { readHistory, recordSession, syncHistory, type SessionRow, type StoredMistake } from "@/lib/history";
import { dayKey } from "@/lib/uid";

export type { SessionRow, StoredMistake } from "@/lib/history";

const localKey = (surah: number) => `dugsi:progress:${surah}`;

function readLocal(surah: number): number {
  try {
    return Number(localStorage.getItem(localKey(surah))) || 0;
  } catch {
    return 0;
  }
}
function writeLocal(surah: number, verse: number): void {
  try {
    const cur = Number(localStorage.getItem(localKey(surah))) || 0;
    if (verse > cur) localStorage.setItem(localKey(surah), String(verse));
  } catch {
    /* storage unavailable */
  }
}
function clearLocal(surah: number): void {
  try {
    localStorage.removeItem(localKey(surah));
  } catch {
    /* ignore */
  }
}

/** Furthest verse reached for a surah. */
export async function loadFurthest(userId: string | null, surah: number): Promise<number> {
  const supabase = getSupabase();
  if (userId && supabase) {
    const { data } = await supabase
      .from("progress")
      .select("furthest_verse")
      .eq("user_id", userId)
      .eq("surah", surah)
      .maybeSingle();
    return data?.furthest_verse ?? 0;
  }
  return readLocal(surah);
}

/** Save reading position (monotonic — only ever moves forward). */
export function saveFurthest(userId: string | null, surah: number, verse: number): void {
  const supabase = getSupabase();
  if (userId && supabase) {
    // Upsert the max; a tiny RPC-free pattern: read-modify-write is racy but the
    // value only grows, so an occasional lost update just under-reports slightly.
    void supabase
      .from("progress")
      .select("furthest_verse")
      .eq("user_id", userId)
      .eq("surah", surah)
      .maybeSingle()
      .then(({ data }) => {
        if ((data?.furthest_verse ?? 0) >= verse) return;
        void supabase
          .from("progress")
          .upsert({ user_id: userId, surah, furthest_verse: verse, updated_at: new Date().toISOString() }, {
            onConflict: "user_id,surah",
          });
      });
    return;
  }
  writeLocal(surah, verse);
}

export function resetFurthest(userId: string | null, surah: number): void {
  const supabase = getSupabase();
  if (userId && supabase) {
    void supabase.from("progress").delete().eq("user_id", userId).eq("surah", surah);
    return;
  }
  clearLocal(surah);
}


export interface SessionRecord {
  surah: number;
  score: number;
  correct: number;
  wrong: number;
  missing: number;
  extra?: number;
  seconds?: number;
  verses?: number;
  from_verse?: number;
  to_verse?: number;
  peeks?: number;
  hifz?: number;
  mistakes: StoredMistake[];
}

/** Record a finished recitation — locally for everyone, and to the account when
 *  signed in. Listeners get a `dugsi:session` event once it is stored. */
export function logSession(userId: string | null, s: SessionRecord): void {
  recordSession(userId, s);
}

/** Per-surah memorisation/mastery, derived from recitation history. */
export interface SurahStat {
  surah: number;
  attempts: number;
  /** Best score ever — the mastery indicator. */
  bestScore: number;
  /** Most recent score. */
  lastScore: number;
  lastPracticed: string;
  /** Words missed across recent attempts (deduped), to review and learn from. */
  mistakes: StoredMistake[];
  /** Distinct verses this reader has recited with a score at/above the
   *  memorised threshold (from sessions that recorded a verse span). */
  memorisedVerses: number;
}

/** One calendar day of activity (for the streak calendar). */
export interface DayStat {
  day: string; // YYYY-MM-DD (local)
  sessions: number;
  seconds: number;
  verses: number;
  bestScore: number;
}

/** A word this reader keeps stumbling on, across every session. */
export interface WordMistake {
  surah: number;
  i: number;
  count: number;
  /** Most recent thing heard (null = skipped). */
  lastHeard: string | null;
  lastAt: string;
}

export interface Stats {
  totalSessions: number;
  /** Consecutive days (including today) with at least one session. */
  streak: number;
  /** Longest streak ever. */
  bestStreak: number;
  /** Sessions recorded today (for the daily goal). */
  todayCount: number;
  averageScore: number;
  /** Surahs with a best score ≥ 90 — effectively memorised. */
  memorisedCount: number;
  recent: { surah: number; score: number; created_at: string }[];
  /** One entry per practised surah, most recently practised first. */
  bySurah: SurahStat[];
  /** Time recited. */
  totalSeconds: number;
  todaySeconds: number;
  weekSeconds: number;
  /** Verses recited (sum over sessions; a verse recited twice counts twice). */
  totalVerses: number;
  todayVerses: number;
  weekVerses: number;
  /** Sessions this week (last 7 days including today). */
  weekCount: number;
  /** Words in total marked correct / wrong / skipped / added. */
  totals: { correct: number; wrong: number; missing: number; extra: number; peeks: number };
  /** Activity per local day, keyed YYYY-MM-DD. */
  days: Record<string, DayStat>;
  /** Score of the last sessions, oldest first (for the trend line). */
  trend: { score: number; created_at: string; surah: number }[];
  /** Most-missed words across all surahs, most frequent first. */
  wordMistakes: WordMistake[];
  /** Verses newly memorised (score ≥ threshold) in the last 30 days. */
  monthMemorised: number;
}

/** A best score at or above this counts a surah as "memorised". */
export const MEMORISED_THRESHOLD = 90;

/**
 * Load stats for this reader. Reads the local history (which is the merged
 * view when signed in); with a user id it first syncs with the account.
 */
export async function loadStats(userId: string | null): Promise<Stats | null> {
  let rows: SessionRow[] = readHistory();
  if (userId && getSupabase()) {
    try {
      rows = await syncHistory(userId);
    } catch {
      /* offline — local view */
    }
  }
  return computeStats(rows, new Date());
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Aggregate raw session rows (newest-first) into display stats. Pure and
 * time-injected so it can be unit-tested.
 */
export function computeStats(data: SessionRow[], now: Date): Stats {
  const total = data.length;
  const averageScore = total ? Math.round(data.reduce((a, r) => a + (r.score ?? 0), 0) / total) : 0;

  // Distinct local days that have a session; streak counts back from today.
  const days = new Set(data.map((r) => new Date(r.created_at).toDateString()));
  let streak = 0;
  const cursor = new Date(now);
  // Allow the streak to start today or yesterday (so a not-yet-practised today
  // doesn't immediately zero a real streak).
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Longest streak ever: walk the sorted distinct days.
  const dayTimes = Array.from(new Set(data.map((r) => startOfDay(new Date(r.created_at)).getTime()))).sort(
    (a, b) => a - b,
  );
  let bestStreak = 0;
  let run = 0;
  for (let k = 0; k < dayTimes.length; k++) {
    if (k > 0 && Math.round((dayTimes[k] - dayTimes[k - 1]) / 86_400_000) === 1) run++;
    else run = 1;
    bestStreak = Math.max(bestStreak, run);
  }

  // Aggregate per surah (data is newest-first, so the first row seen per surah
  // is its most recent attempt).
  const map = new Map<number, SurahStat>();
  // Track which reference words are already collected per surah (dedupe), keeping
  // the most recent "heard" for each. Capped so a surah can't store unboundedly.
  const seen = new Map<number, Set<number>>();
  const memorisedVerses = new Map<number, Set<number>>();
  const MISTAKE_CAP = 40;
  const wordMap = new Map<string, WordMistake>();
  const dayMap: Record<string, DayStat> = {};
  const totals = { correct: 0, wrong: 0, missing: 0, extra: 0, peeks: 0 };
  let totalSeconds = 0;
  let todaySeconds = 0;
  let weekSeconds = 0;
  let totalVerses = 0;
  let todayVerses = 0;
  let weekVerses = 0;
  let weekCount = 0;
  let monthMemorised = 0;
  const todayStr = now.toDateString();
  const weekStart = startOfDay(now).getTime() - 6 * 86_400_000;
  const monthStart = startOfDay(now).getTime() - 29 * 86_400_000;
  const monthMemorisedSet = new Set<string>();

  for (const r of data) {
    const when = new Date(r.created_at);
    const secs = Math.max(0, r.seconds ?? 0);
    const verses = Math.max(0, r.verses ?? 0);
    const isToday = when.toDateString() === todayStr;
    const inWeek = when.getTime() >= weekStart;
    totalSeconds += secs;
    totalVerses += verses;
    if (isToday) {
      todaySeconds += secs;
      todayVerses += verses;
    }
    if (inWeek) {
      weekSeconds += secs;
      weekVerses += verses;
      weekCount++;
    }
    totals.correct += r.correct ?? 0;
    totals.wrong += r.wrong ?? 0;
    totals.missing += r.missing ?? 0;
    totals.extra += r.extra ?? 0;
    totals.peeks += r.peeks ?? 0;

    const dk = dayKey(when);
    const d = (dayMap[dk] ??= { day: dk, sessions: 0, seconds: 0, verses: 0, bestScore: 0 });
    d.sessions++;
    d.seconds += secs;
    d.verses += verses;
    d.bestScore = Math.max(d.bestScore, r.score ?? 0);

    let cur = map.get(r.surah);
    if (!cur) {
      cur = {
        surah: r.surah,
        attempts: 1,
        bestScore: r.score ?? 0,
        lastScore: r.score ?? 0,
        lastPracticed: r.created_at,
        mistakes: [],
        memorisedVerses: 0,
      };
      map.set(r.surah, cur);
      seen.set(r.surah, new Set());
      memorisedVerses.set(r.surah, new Set());
    } else {
      cur.attempts++;
      cur.bestScore = Math.max(cur.bestScore, r.score ?? 0);
    }
    if ((r.score ?? 0) >= MEMORISED_THRESHOLD && r.from_verse && r.to_verse && r.to_verse >= r.from_verse) {
      const set = memorisedVerses.get(r.surah)!;
      const lo = r.from_verse;
      const hi = Math.min(r.to_verse, lo + 400);
      for (let v = lo; v <= hi; v++) {
        set.add(v);
        if (when.getTime() >= monthStart) monthMemorisedSet.add(`${r.surah}:${v}`);
      }
    }
    const seenSet = seen.get(r.surah)!;
    for (const m of r.mistakes ?? []) {
      if (!m || typeof m.i !== "number") continue;
      if (cur.mistakes.length < MISTAKE_CAP && !seenSet.has(m.i)) {
        seenSet.add(m.i);
        cur.mistakes.push({ i: m.i, h: m.h ?? null });
      }
      const key = `${r.surah}:${m.i}`;
      const w = wordMap.get(key);
      if (w) w.count++;
      else wordMap.set(key, { surah: r.surah, i: m.i, count: 1, lastHeard: m.h ?? null, lastAt: r.created_at });
    }
  }
  for (const [surah, set] of memorisedVerses) {
    const st = map.get(surah);
    if (st) st.memorisedVerses = set.size;
  }
  monthMemorised = monthMemorisedSet.size;

  const bySurah = Array.from(map.values()).sort(
    (a, b) => new Date(b.lastPracticed).getTime() - new Date(a.lastPracticed).getTime(),
  );
  const memorisedCount = bySurah.filter((s) => s.bestScore >= MEMORISED_THRESHOLD).length;
  const todayCount = data.filter((r) => new Date(r.created_at).toDateString() === todayStr).length;
  const wordMistakes = Array.from(wordMap.values())
    .sort((a, b) => b.count - a.count || new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .slice(0, 150);
  const trend = data
    .slice(0, 30)
    .map((r) => ({ score: r.score ?? 0, created_at: r.created_at, surah: r.surah }))
    .reverse();

  return {
    totalSessions: total,
    streak,
    bestStreak,
    todayCount,
    averageScore,
    memorisedCount,
    recent: data.slice(0, 8),
    bySurah,
    totalSeconds,
    todaySeconds,
    weekSeconds,
    totalVerses,
    todayVerses,
    weekVerses,
    weekCount,
    totals,
    days: dayMap,
    trend,
    wordMistakes,
    monthMemorised,
  };
}
