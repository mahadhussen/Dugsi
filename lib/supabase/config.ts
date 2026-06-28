// Public Supabase config for Dugsi.
//
// These values are safe to commit and ship in the client: the publishable
// (anon) key is designed to live in the browser, and per-user data is protected
// by Row-Level Security in the database — not by keeping this key secret. The
// secret/service_role key is never used in the app and must never be committed.
//
// Build-time env vars (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY) take precedence if
// set, so this can still be overridden per environment.

export const SUPABASE_URL = "https://basbysdxfypwponhxter.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_To8GiHU8S5r5ScICi1AQjQ_1MtSArLE";
