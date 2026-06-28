"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "./client";

interface AuthValue {
  user: User | null;
  /** True until the initial session check finishes. */
  loading: boolean;
  /** Whether Supabase is configured at all (accounts available). */
  configured: boolean;
  signUp: (email: string, password: string) => Promise<{ error?: string; needsConfirm?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Wrong email or password.";
  if (m.includes("already registered")) return "That email already has an account — sign in instead.";
  if (m.includes("password should be")) return "Password must be at least 6 characters.";
  if (m.includes("unable to validate email") || m.includes("invalid email")) return "That email doesn't look right.";
  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Accounts aren't available right now." };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: friendly(error.message) };
    // When email confirmation is on, there's no session until the user confirms.
    return { needsConfirm: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) return { error: "Accounts aren't available right now." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? { error: friendly(error.message) } : {};
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, loading, configured: isSupabaseConfigured, signUp, signIn, signOut }),
    [user, loading, signUp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
