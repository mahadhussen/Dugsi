// Supabase browser client.
//
// The URL and anon key are public by design (the anon key is meant to ship in
// the client; per-user data is protected by Row-Level Security in the database,
// not by hiding the key). They're injected at build time from the deploy
// workflow's environment so they aren't committed to the repo.
//
// If they're absent (e.g. a local build without env vars) the client is null and
// the app runs in anonymous mode: progress falls back to this device's
// localStorage, exactly as before accounts existed.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient | null = null;

/** The shared browser client, or null when Supabase isn't configured. */
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!cached) {
    cached = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return cached;
}
