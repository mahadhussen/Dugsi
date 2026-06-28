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

export interface SessionRecord {
  surah: number;
  score: number;
  correct: number;
  wrong: number;
  missing: number;
}

/** Record a finished recitation (signed-in only) and notify any listeners. */
export function logSession(userId: string | null, s: SessionRecord): void {
  const supabase = getSupabase();
  if (!userId || !supabase) return;
  void supabase
    .from("sessions")
    .insert({ user_id: userId, ...s })
    .then(() => {
      if (typeof window !== "undefined") window.dispatchEvent(new Event("dugsi:session"));
    });
}

export interface Stats {
  totalSessions: number;
  /** Consecutive days (including today) with at least one session. */
  streak: number;
  averageScore: number;
  recent: { surah: number; score: number; created_at: string }[];
}

export async function loadStats(userId: string): Promise<Stats | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("sessions")
    .select("surah, score, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return null;

  const total = data.length;
  const averageScore = total ? Math.round(data.reduce((a, r) => a + (r.score ?? 0), 0) / total) : 0;

  // Distinct local days that have a session; streak counts back from today.
  const days = new Set(data.map((r) => new Date(r.created_at).toDateString()));
  let streak = 0;
  const cursor = new Date();
  // Allow the streak to start today or yesterday (so a not-yet-practised today
  // doesn't immediately zero a real streak).
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { totalSessions: total, streak, averageScore, recent: data.slice(0, 8) };
}
