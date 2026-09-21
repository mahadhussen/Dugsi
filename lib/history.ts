// Local-first recitation history.
//
// Every finished recitation is stored on this device first (localStorage), so
// streaks, mistake history and the analytics dashboard work for everyone —
// signed in or not. With an account the same rows are also pushed to Supabase
// and merged back from other devices, so the history follows the reader.
//
// Merge rule: each row carries a client id generated where it was recorded; the
// cloud table stores it too, so the same session is never counted twice. Rows
// that predate client ids are matched on (surah, score, created_at) instead.

import { getSupabase } from "./supabase/client";
import { uid } from "./uid";

/** A single mistaken word, kept compact: reference index + what was heard
 *  (null = the word was skipped). The correct text/verse is re-derived from the
 *  surah at review time, so we don't duplicate the Quran text into every row. */
export interface StoredMistake {
  i: number;
  h: string | null;
}

/** One finished recitation. Optional fields were added later — old rows may
 *  lack them, and the stats code treats a missing value as zero/unknown. */
export interface SessionRow {
  surah: number;
  score: number;
  created_at: string;
  mistakes?: StoredMistake[] | null;
  correct?: number | null;
  wrong?: number | null;
  missing?: number | null;
  /** Words the reciter added that are not in the text. */
  extra?: number | null;
  /** How long the recitation lasted. */
  seconds?: number | null;
  /** Distinct verses in the recited span. */
  verses?: number | null;
  from_verse?: number | null;
  to_verse?: number | null;
  /** Times the reciter peeked at a hidden word/verse (memorisation mode). */
  peeks?: number | null;
  /** Memorisation level used (0 = text visible). */
  hifz?: number | null;
  /** Long pauses mid-recitation (voice activity detection). */
  hesitations?: number | null;
  client_id?: string | null;
}

export interface LocalSession extends SessionRow {
  client_id: string;
  /** True once the row is known to exist in the cloud. */
  synced?: boolean;
}

const KEY = "dugsi:history:v1";
const MAX_ROWS = 1500;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/** All locally stored sessions, newest first. */
export function readHistory(): LocalSession[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? sortNewest(arr.filter(isRow)) : [];
  } catch {
    return [];
  }
}

function isRow(x: unknown): x is LocalSession {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as LocalSession).surah === "number" &&
    typeof (x as LocalSession).created_at === "string" &&
    typeof (x as LocalSession).client_id === "string"
  );
}

function writeHistory(rows: LocalSession[]): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(sortNewest(rows).slice(0, MAX_ROWS)));
  } catch {
    /* quota — the in-memory result still stands */
  }
}

export function sortNewest<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

/** Append one finished recitation locally. Returns the stored row. */
export function appendHistory(s: Omit<SessionRow, "created_at" | "client_id"> & { created_at?: string }): LocalSession {
  const row: LocalSession = {
    ...s,
    created_at: s.created_at ?? new Date().toISOString(),
    client_id: uid(),
    synced: false,
  };
  writeHistory([row, ...readHistory()]);
  return row;
}

/** Wipe local history (does not touch the cloud). */
export function clearHistory(): void {
  storage()?.removeItem(KEY);
}

// ── Merge ────────────────────────────────────────────────────────────────────

function fingerprint(r: SessionRow): string {
  return `${r.surah}|${r.score}|${new Date(r.created_at).getTime()}`;
}

/**
 * Merge cloud rows into local rows. A row is the same session when the client
 * ids match, or (for rows recorded before client ids existed) when surah, score
 * and timestamp match. Pure, so it can be unit-tested.
 */
export function mergeHistory(local: LocalSession[], cloud: SessionRow[]): LocalSession[] {
  const byId = new Map<string, LocalSession>();
  const byPrint = new Map<string, LocalSession>();
  for (const l of local) {
    byId.set(l.client_id, l);
    byPrint.set(fingerprint(l), l);
  }
  const out: LocalSession[] = [...local];
  for (const c of cloud) {
    const existing = (c.client_id && byId.get(c.client_id)) || byPrint.get(fingerprint(c));
    if (existing) {
      existing.synced = true;
      // Fill in any richer detail the cloud has that this device never saw.
      for (const k of Object.keys(c) as (keyof SessionRow)[]) {
        if ((existing as SessionRow)[k] == null && c[k] != null) (existing as SessionRow)[k] = c[k] as never;
      }
      continue;
    }
    const row: LocalSession = { ...c, client_id: c.client_id || uid(), synced: true };
    byId.set(row.client_id, row);
    byPrint.set(fingerprint(row), row);
    out.push(row);
  }
  return sortNewest(out);
}

// ── Cloud sync ───────────────────────────────────────────────────────────────

const CLOUD_LIMIT = 1500;

/** Columns that exist since the first schema (safe fallback insert). */
function baseColumns(r: LocalSession) {
  return {
    surah: r.surah,
    score: r.score,
    correct: r.correct ?? 0,
    wrong: r.wrong ?? 0,
    missing: r.missing ?? 0,
    mistakes: r.mistakes ?? null,
    created_at: r.created_at,
  };
}

function fullColumns(r: LocalSession, userId: string) {
  return {
    user_id: userId,
    client_id: r.client_id,
    ...baseColumns(r),
    extra: r.extra ?? 0,
    seconds: r.seconds ?? 0,
    verses: r.verses ?? 0,
    from_verse: r.from_verse ?? null,
    to_verse: r.to_verse ?? null,
    peeks: r.peeks ?? 0,
    hifz: r.hifz ?? 0,
    hesitations: r.hesitations ?? 0,
  };
}

let syncing: Promise<LocalSession[]> | null = null;

/**
 * Push unsynced local sessions to the account and pull the account's history
 * back, merging both into the local store. Resolves to the merged history.
 * Safe to call often — concurrent calls share one in-flight sync.
 */
export function syncHistory(userId: string): Promise<LocalSession[]> {
  if (syncing) return syncing;
  syncing = doSync(userId).finally(() => {
    syncing = null;
  });
  return syncing;
}

async function doSync(userId: string): Promise<LocalSession[]> {
  const supabase = getSupabase();
  let local = readHistory();
  if (!supabase) return local;

  // 1. Upload what this device recorded while offline / signed out.
  const pending = local.filter((r) => !r.synced);
  if (pending.length > 0) {
    const { error } = await supabase
      .from("sessions")
      .upsert(pending.map((r) => fullColumns(r, userId)), { onConflict: "user_id,client_id" });
    if (!error) {
      pending.forEach((r) => (r.synced = true));
    } else {
      // Older schema (no client_id / new columns): insert the base shape so the
      // history still reaches the account. Dedupe on pull uses the fingerprint.
      const { error: e2 } = await supabase
        .from("sessions")
        .insert(pending.map((r) => ({ user_id: userId, ...baseColumns(r) })));
      if (!e2) pending.forEach((r) => (r.synced = true));
    }
    writeHistory(local);
  }

  // 2. Pull the account's history and merge.
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(CLOUD_LIMIT);
  if (!error && data) {
    local = mergeHistory(local, data as SessionRow[]);
    writeHistory(local);
  }
  return local;
}

/** Record a finished recitation: always locally, and to the account when signed in. */
export function recordSession(userId: string | null, s: Omit<SessionRow, "created_at" | "client_id">): LocalSession {
  const row = appendHistory(s);
  const notify = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("dugsi:session"));
  };
  if (userId && getSupabase()) {
    void syncHistory(userId).finally(notify);
  } else {
    notify();
  }
  return row;
}
