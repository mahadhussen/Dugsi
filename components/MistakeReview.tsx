"use client";

import { useEffect, useRef, useState } from "react";
import { ayahAudioUrl } from "@/lib/audio-quran";
import type { TimeRange } from "@/lib/review";

export interface Mistake {
  refIndex: number;
  /** Correct word, full Uthmani spelling. */
  uthmani: string;
  translit?: string;
  /** What the reciter said (Arabic), or null if skipped. */
  heard: string | null;
  verse: number;
  skipped: boolean;
  /** Where in the recording the reciter said it (High-accuracy mode only). */
  time?: TimeRange;
}

// Only one thing plays at a time across the whole review.
let current: HTMLAudioElement | null = null;
function stopCurrent() {
  if (current) {
    current.pause();
    current.onpause = null;
    current.ontimeupdate = null;
    current = null;
  }
}

export default function MistakeReview({
  mistakes,
  surahNumber,
  recordingUrl,
}: {
  mistakes: Mistake[];
  surahNumber: number;
  recordingUrl?: string;
}) {
  useEffect(() => () => stopCurrent(), []);
  if (mistakes.length === 0) return null;

  return (
    <div className="mt-5 rounded-xl border border-ink/10 bg-white/70 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink/45">
        Review your mistakes ({mistakes.length})
      </p>
      <ul className="space-y-2.5">
        {mistakes.map((m) => (
          <MistakeRow key={m.refIndex} m={m} surahNumber={surahNumber} recordingUrl={recordingUrl} />
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink/40">
        Tap <strong>You</strong> to hear yourself and <strong>Correct</strong> for the qari — listen
        to the difference, then recite it again.
        {!recordingUrl && " Hearing yourself needs High accuracy mode."}
      </p>
    </div>
  );
}

function MistakeRow({
  m,
  surahNumber,
  recordingUrl,
}: {
  m: Mistake;
  surahNumber: number;
  recordingUrl?: string;
}) {
  const [playing, setPlaying] = useState<"you" | "correct" | null>(null);
  const localRef = useRef<HTMLAudioElement | null>(null);

  const playYou = () => {
    if (!recordingUrl || !m.time) return;
    if (playing === "you") {
      stopCurrent();
      setPlaying(null);
      return;
    }
    stopCurrent();
    const a = localRef.current ?? new Audio(recordingUrl);
    localRef.current = a;
    a.currentTime = m.time.start;
    a.ontimeupdate = () => {
      if (m.time && a.currentTime >= m.time.end) {
        a.pause();
      }
    };
    a.onpause = () => setPlaying(null);
    current = a;
    setPlaying("you");
    void a.play().catch(() => setPlaying(null));
  };

  const playCorrect = () => {
    if (playing === "correct") {
      stopCurrent();
      setPlaying(null);
      return;
    }
    stopCurrent();
    const a = new Audio(ayahAudioUrl(surahNumber, m.verse));
    a.onended = () => setPlaying(null);
    a.onpause = () => setPlaying(null);
    a.onerror = () => setPlaying(null);
    current = a;
    setPlaying("correct");
    void a.play().catch(() => setPlaying(null));
  };

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-ink/5">
      <div className="min-w-0">
        <div className="ayah text-2xl leading-tight text-ink" dir="rtl">
          {m.uthmani}
        </div>
        <div className="text-xs text-ink/50">
          {m.skipped ? (
            <span className="text-amber-700">skipped</span>
          ) : (
            <>
              you said <span className="font-arabic text-ink/70" dir="rtl">{m.heard}</span>
            </>
          )}
          {m.translit ? ` · ${m.translit}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {recordingUrl && m.time && (
          <AudioChip label="You" active={playing === "you"} tone="ink" onClick={playYou} />
        )}
        <AudioChip label="Correct" active={playing === "correct"} tone="emerald" onClick={playCorrect} />
      </div>
    </li>
  );
}

function AudioChip({
  label,
  active,
  tone,
  onClick,
}: {
  label: string;
  active: boolean;
  tone: "ink" | "emerald";
  onClick: () => void;
}) {
  const base = tone === "emerald" ? "text-emerald ring-emerald/30" : "text-ink/70 ring-ink/15";
  const on = tone === "emerald" ? "bg-emerald text-white ring-emerald" : "bg-ink text-white ring-ink";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${
        active ? on : base
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
        {active ? <rect x="6" y="5" width="12" height="14" rx="1" /> : <path d="M8 5v14l11-7z" />}
      </svg>
      {label}
    </button>
  );
}
