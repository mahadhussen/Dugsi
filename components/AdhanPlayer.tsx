"use client";

import { useEffect, useRef, useState } from "react";
import { ADHANS, DEFAULT_ADHAN_ID, getAdhan } from "@/lib/adhan-audio";

const STORAGE_KEY = "dugsi:adhan";

/** Listen to the call to prayer: pick a böneutropare and press play. The choice
 *  is remembered on the device. Manual playback — a web app can't reliably sound
 *  the adhan on its own while closed, so this is a "play when you want" player. */
export default function AdhanPlayer() {
  const [id, setId] = useState(DEFAULT_ADHAN_ID);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Remembered choice.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && getAdhan(saved).id === saved) setId(saved);
    } catch {
      // storage disabled — keep default
    }
  }, []);

  // One audio element, wired once.
  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    a.onplay = () => setPlaying(true);
    a.onpause = () => setPlaying(false);
    a.onended = () => setPlaying(false);
    a.onplaying = () => setStatus("idle");
    a.onerror = () => {
      setStatus("error");
      setPlaying(false);
    };
    audioRef.current = a;
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, []);

  const select = (newId: string) => {
    setId(newId);
    try {
      localStorage.setItem(STORAGE_KEY, newId);
    } catch {
      // ignore
    }
    const a = audioRef.current;
    if (a && !a.paused) {
      // Switch voice immediately if one is already playing.
      a.pause();
      a.src = getAdhan(newId).url;
      setStatus("loading");
      void a.play().catch(() => setStatus("error"));
    }
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    const url = getAdhan(id).url;
    if (a.src !== url) a.src = url;
    setStatus("loading");
    void a.play().catch(() => setStatus("error"));
  };

  const current = getAdhan(id);

  return (
    <div className="rounded-2xl border border-gold/25 bg-white/80 p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-ink/45">Böneutropare · adhan</p>
          <p className="truncate text-base font-semibold text-ink">
            {current.name}
            {status === "error" && <span className="text-sm text-red-500"> · kunde inte spela</span>}
          </p>
          {current.note && <p className="truncate text-xs text-ink/50">{current.note}</p>}
        </div>
        <button
          onClick={toggle}
          aria-label={playing ? "Stoppa adhan" : "Spela adhan"}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-b from-emerald to-emerald-deep text-white shadow-soft transition hover:brightness-105 active:scale-95"
        >
          {status === "loading" && playing ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : playing ? (
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {ADHANS.map((a) => (
          <button
            key={a.id}
            onClick={() => select(a.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
              a.id === id
                ? "bg-emerald text-white ring-emerald"
                : "bg-white text-ink/70 ring-gold/30 hover:ring-emerald/40"
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-ink/40">
        Tips: en webbapp kan inte spela adhan automatiskt när appen är stängd. Här spelar du adhan
        när du vill — nedräkningen ovan visar när nästa bön infaller.
      </p>
    </div>
  );
}
