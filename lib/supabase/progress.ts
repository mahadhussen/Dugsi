// Per-user progress & session history.
//
// When the reader is signed in, reading position and recitation sessions are
// stored in Supabase (and so follow them to any device). When signed out we keep
// the old behaviour: furthest verse in this device's localStorage, no history.

import { getSupabase } from "./client";

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

/** A single mistaken word, kept compact: reference index + what was heard
 *  (null = the word was skipped). The correct text/verse is re-derived from the
 *  surah at review time, so we don't duplicate the Quran text into every row. */
export interface StoredMistake {
  i: number;
  h: string | null;
}

export interface SessionRecord {
  surah: number;
  score: number;
  correct: number;
  wrong: number;
  missing: number;
  mistakes: StoredMistake[];
}

/** Record a finished recitation (signed-in only) and notify any listeners. */
export function logSession(userId: string | null, s: SessionRecord): void {
  const supabase = getSupabase();
  if (!userId || !supabase) return;
  const notify = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("dugsi:session"));
  };
  const { mistakes, ...base } = s;
  void supabase
    .from("sessions")
    .insert({ user_id: userId, ...base, mistakes })
    .then(({ error }) => {
      if (!error) return notify();
      // The `mistakes` column may not exist yet (migration not run). Fall back to
      // logging the session without it so progress tracking still works.
      void supabase
        .from("sessions")
        .insert({ user_id: userId, ...base })
        .then(notify);
    });
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
}

export interface Stats {
  totalSessions: number;
  /** Consecutive days (including today) with at least one session. */
  streak: number;
  /** Sessions recorded today (for the daily goal). */
  todayCount: number;
  averageScore: number;
  /** Surahs with a best score ≥ 90 — effectively memorised. */
  memorisedCount: number;
  recent: { surah: number; score: number; created_at: string }[];
  /** One entry per practised surah, most recently practised first. */
  bySurah: SurahStat[];
}

/** A best score at or above this counts a surah as "memorised". */
export const MEMORISED_THRESHOLD = 90;

export async function loadStats(userId: string): Promise<Stats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  // Try to fetch the stored mistakes; if that column doesn't exist yet, retry
  // without it so stats still load.
  let res = await supabase
    .from("sessions")
    .select("surah, score, created_at, mistakes")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (res.error) {
    res = (await supabase
      .from("sessions")
      .select("surah, score, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500)) as typeof res;
  }
  if (res.error || !res.data) return null;
  return computeStats(res.data as SessionRow[], new Date());
}

export interface SessionRow {
  surah: number;
  score: number;
  created_at: string;
  mistakes?: StoredMistake[] | null;
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

  // Aggregate per surah (data is newest-first, so the first row seen per surah
  // is its most recent attempt).
  const map = new Map<number, SurahStat>();
  // Track which reference words are already collected per surah (dedupe), keeping
  // the most recent "heard" for each. Capped so a surah can't store unboundedly.
  const seen = new Map<number, Set<number>>();
  const MISTAKE_CAP = 40;
  for (const r of data) {
    let cur = map.get(r.surah);
    if (!cur) {
      cur = {
        surah: r.surah,
        attempts: 1,
        bestScore: r.score ?? 0,
        lastScore: r.score ?? 0,
        lastPracticed: r.created_at,
        mistakes: [],
      };
      map.set(r.surah, cur);
      seen.set(r.surah, new Set());
    } else {
      cur.attempts++;
      cur.bestScore = Math.max(cur.bestScore, r.score ?? 0);
    }
    const seenSet = seen.get(r.surah)!;
    for (const m of r.mistakes ?? []) {
      if (cur.mistakes.length >= MISTAKE_CAP) break;
      if (m && typeof m.i === "number" && !seenSet.has(m.i)) {
        seenSet.add(m.i);
        cur.mistakes.push({ i: m.i, h: m.h ?? null });
      }
    }
  }
  const bySurah = Array.from(map.values()).sort(
    (a, b) => new Date(b.lastPracticed).getTime() - new Date(a.lastPracticed).getTime(),
  );
  const memorisedCount = bySurah.filter((s) => s.bestScore >= MEMORISED_THRESHOLD).length;
  const todayStr = now.toDateString();
  const todayCount = data.filter((r) => new Date(r.created_at).toDateString() === todayStr).length;

  return {
    totalSessions: total,
    streak,
    todayCount,
    averageScore,
    memorisedCount,
    recent: data.slice(0, 8),
    bySurah,
  };
}
