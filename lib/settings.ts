// Goals and reminder settings — local first, synced to the account when signed in.
//
// The whole settings object is one JSON document, stored in localStorage and
// mirrored in a `user_settings` row (last write wins by `updatedAt`).

import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase/client";

export interface Settings {
  /** Minutes of recitation per day. */
  dailyMinutes: number;
  /** Recitations (sessions) per day. */
  dailySessions: number;
  /** Verses recited per week. */
  weeklyVerses: number;
  /** Verses to newly memorise (best score ≥ threshold) per month. */
  monthlyMemorise: number;
  /** Paint skipped / substituted words red while reciting (live mistake detection). */
  liveMistakes: boolean;
  /** Prefer Tarteel's Quran-tuned Whisper for the precise check (falls back automatically). */
  quranModel: boolean;
  /** Stop the recording by itself after a long silence at the end. */
  autoStop: boolean;
  /** Show the translation / transliteration under each verse of the mushaf. */
  showTranslation: boolean;
  showTranslit: boolean;
  reminderEnabled: boolean;
  /** "HH:MM" local time. */
  reminderTime: string;
  /** 0 = Sunday … 6 = Saturday. Empty = every day. */
  reminderDays: number[];
  updatedAt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  dailyMinutes: 10,
  dailySessions: 1,
  weeklyVerses: 20,
  monthlyMemorise: 10,
  liveMistakes: true,
  quranModel: true,
  autoStop: false,
  showTranslation: true,
  showTranslit: false,
  reminderEnabled: false,
  reminderTime: "20:00",
  reminderDays: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};

const KEY = "dugsi:settings:v1";
const LEGACY_GOAL_KEY = "dugsi:dailyGoal";

let cache: Settings | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function sanitize(x: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(x ?? {}) };
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;
  return {
    dailyMinutes: num(s.dailyMinutes, 10, 1, 240),
    dailySessions: num(s.dailySessions, 1, 1, 20),
    weeklyVerses: num(s.weeklyVerses, 20, 1, 2000),
    monthlyMemorise: num(s.monthlyMemorise, 10, 1, 1000),
    liveMistakes: s.liveMistakes !== false,
    quranModel: s.quranModel !== false,
    autoStop: !!s.autoStop,
    showTranslation: s.showTranslation !== false,
    showTranslit: !!s.showTranslit,
    reminderEnabled: !!s.reminderEnabled,
    reminderTime: /^\d{2}:\d{2}$/.test(String(s.reminderTime)) ? String(s.reminderTime) : "20:00",
    reminderDays: Array.isArray(s.reminderDays) ? s.reminderDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : DEFAULT_SETTINGS.updatedAt,
  };
}

export function readSettings(): Settings {
  if (cache) return cache;
  const s = storage();
  let parsed: Partial<Settings> | null = null;
  try {
    const raw = s?.getItem(KEY);
    if (raw) parsed = JSON.parse(raw);
    // Carry over the old "sessions per day" goal from before settings existed.
    if (!parsed && s) {
      const legacy = Number(s.getItem(LEGACY_GOAL_KEY));
      if (legacy >= 1) parsed = { dailySessions: legacy };
    }
  } catch {
    parsed = null;
  }
  cache = sanitize(parsed);
  return cache;
}

function persist(next: Settings): void {
  cache = next;
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Update settings (partial). Syncs to the account when a user id is given. */
export function updateSettings(patch: Partial<Settings>, userId: string | null = null): Settings {
  const next = sanitize({ ...readSettings(), ...patch, updatedAt: new Date().toISOString() });
  persist(next);
  if (userId) void pushSettings(userId, next);
  return next;
}

async function pushSettings(userId: string, s: Settings): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase
    .from("user_settings")
    .upsert({ user_id: userId, data: s, updated_at: s.updatedAt }, { onConflict: "user_id" });
}

/** Pull the account's settings; the newer copy (local or cloud) wins. */
export async function syncSettings(userId: string): Promise<Settings> {
  const supabase = getSupabase();
  const local = readSettings();
  if (!supabase) return local;
  const { data, error } = await supabase.from("user_settings").select("data, updated_at").eq("user_id", userId).maybeSingle();
  if (error) return local;
  const cloud = data?.data ? sanitize(data.data as Partial<Settings>) : null;
  if (!cloud) {
    if (local.updatedAt !== DEFAULT_SETTINGS.updatedAt) await pushSettings(userId, local);
    return local;
  }
  if (new Date(cloud.updatedAt) > new Date(local.updatedAt)) {
    persist(cloud);
    return cloud;
  }
  if (new Date(cloud.updatedAt) < new Date(local.updatedAt)) await pushSettings(userId, local);
  return local;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** React hook: live settings (re-renders on change). */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, readSettings, () => DEFAULT_SETTINGS);
}
