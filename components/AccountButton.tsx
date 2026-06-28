"use client";

import { useState } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";

export default function AccountButton() {
  const { user, loading, configured, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  if (!configured) return null; // accounts not set up — stay invisible

  return (
    <>
      <div className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
        {loading ? null : user ? (
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[10rem] truncate text-xs text-white/70 sm:inline">
              {user.email}
            </span>
            <button
              onClick={() => void signOut()}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-gold-soft ring-1 ring-white/15 transition hover:bg-white/20"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-gold-soft ring-1 ring-white/15 transition hover:bg-white/20"
          >
            Sign in
          </button>
        )}
      </div>
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </>
  );
}

function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (mode === "up" && "needsConfirm" in res && res.needsConfirm) {
      setInfo("Check your email to confirm your account, then sign in.");
      setMode("in");
      return;
    }
    onClose(); // signed in
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-gold/25 bg-white p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">{mode === "in" ? "Welcome back" : "Create your account"}</h2>
          <button onClick={onClose} className="text-ink/40 transition hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-4 text-sm text-ink/60">
          {mode === "in"
            ? "Sign in to keep your progress and streak across devices."
            : "Your reading progress, streak and history follow you to any device."}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/20"
          />
          <input
            type="password"
            required
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-ink/15 px-3.5 py-2.5 text-sm outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/20"
          />

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {info && <p className="rounded-lg bg-emerald/10 px-3 py-2 text-sm text-emerald-deep">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-b from-emerald to-emerald-deep py-2.5 text-sm font-semibold text-white shadow-soft transition active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink/60">
          {mode === "in" ? "New to Dugsi?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setError(null);
              setInfo(null);
            }}
            className="font-semibold text-emerald-deep underline underline-offset-2"
          >
            {mode === "in" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
