"use client";

import { useEffect, useRef, useState } from "react";
import { ayahAudioUrl } from "@/lib/audio-quran";

// Only one ayah plays at a time across the page.
let currentAudio: HTMLAudioElement | null = null;

export default function PlayButton({ surah, ayah }: { surah: number; ayah: number }) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) a.pause();
      if (currentAudio === a) currentAudio = null;
    };
  }, []);

  const toggle = () => {
    let a = audioRef.current;
    if (a && !a.paused) {
      a.pause();
      return;
    }
    if (currentAudio && currentAudio !== a) currentAudio.pause();
    if (!a) {
      a = new Audio(ayahAudioUrl(surah, ayah));
      a.preload = "none";
      a.onplay = () => setPlaying(true);
      a.onpause = () => setPlaying(false);
      a.onended = () => setPlaying(false);
      a.onerror = () => {
        setError(true);
        setPlaying(false);
      };
      audioRef.current = a;
    }
    currentAudio = a;
    setError(false);
    void a.play().catch(() => setError(true));
  };

  return (
    <button
      onClick={toggle}
      aria-label={playing ? "Pause recitation" : "Play recitation"}
      title={error ? "Couldn't load audio" : playing ? "Pause" : "Listen"}
      className={`inline-grid h-7 w-7 place-items-center rounded-full align-middle transition ${
        error
          ? "text-red-400"
          : playing
            ? "bg-emerald text-white"
            : "text-emerald hover:bg-emerald/10"
      }`}
    >
      {playing ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
