"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import SurahView from "./SurahView";
import { Recognizer, isSpeechSupported } from "@/lib/speech/recognizer";
import { analyzeRecitation, type RecitationFeedback } from "@/lib/analyze";
import type { WordStatus } from "@/lib/align";

type Phase = "idle" | "recording" | "done" | "error" | "unsupported";

export default function Reciter() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RecitationFeedback | null>(null);
  const [liveText, setLiveText] = useState("");
  const [seconds, setSeconds] = useState(0);

  const recognizerRef = useRef<Recognizer | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveRef = useRef("");

  useEffect(() => {
    if (!isSpeechSupported()) setPhase("unsupported");
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recognizerRef.current?.cancel();
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const start = () => {
    setError(null);
    setFeedback(null);
    setLiveText("");
    liveRef.current = "";

    const recognizer = new Recognizer({
      onTranscript: (text) => {
        liveRef.current = text;
        setLiveText(text);
      },
      onError: (message) => {
        stopTimer();
        setError(message);
        setPhase("error");
      },
      onDone: (finalText) => {
        stopTimer();
        const transcript = finalText || liveRef.current;
        if (!transcript.trim()) {
          setError("We couldn't hear any recitation. Please try again in a quieter place.");
          setPhase("error");
          return;
        }
        setFeedback(analyzeRecitation(transcript, [], "on-device speech"));
        setPhase("done");
      },
    });

    recognizerRef.current = recognizer;
    recognizer.start("ar-SA");
    setPhase("recording");
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  const stop = () => {
    setPhase("done"); // optimistic; onDone will fill feedback
    recognizerRef.current?.stop();
  };

  const reset = () => {
    setFeedback(null);
    setError(null);
    setLiveText("");
    setPhase("idle");
  };

  const statuses: Record<number, WordStatus> | undefined = useMemo(
    () =>
      feedback
        ? Object.fromEntries(feedback.alignment.words.map((w) => [w.refIndex, w.status]))
        : undefined,
    [feedback],
  );

  if (phase === "unsupported") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Your browser doesn&apos;t support on-device speech recognition yet. Please open Dugsi in{" "}
        <strong>Google Chrome</strong> (or Safari on iPhone) to use the recitation feedback. You can
        still read the surah and tajweed guide below.
        <div className="mt-4 rounded-2xl border border-gold/20 bg-white/70 p-6">
          <SurahView showTajweed />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        {phase !== "recording" && (
          <button
            onClick={start}
            className="rounded-full bg-emerald px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-95"
          >
            {phase === "done" || phase === "error" ? "Recite again" : "Start reciting"}
          </button>
        )}

        {phase === "recording" && (
          <button
            onClick={stop}
            className="flex items-center gap-3 rounded-full bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-95"
          >
            <span className="rec-dot h-3 w-3 rounded-full bg-white" />
            Stop ({formatTime(seconds)})
          </button>
        )}

        {phase === "idle" && (
          <p className="text-sm text-ink/60">
            Tap, recite Surah Al-Fatiha aloud, then tap stop. Everything runs free on your device.
          </p>
        )}

        {phase === "recording" && (
          <div className="w-full rounded-lg border border-emerald/30 bg-white/70 p-3 text-center">
            <p className="ayah text-2xl text-ink/80" dir="rtl">
              {liveText || "…"}
            </p>
            <p className="mt-1 text-xs text-ink/50">Listening — recite at your own pace.</p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {feedback && phase === "done" && <ResultsPanel feedback={feedback} onReset={reset} />}

      <div className="rounded-2xl border border-gold/20 bg-white/70 p-6 shadow-sm sm:p-8">
        <SurahView statuses={statuses} showTajweed={!feedback} />
      </div>
    </div>
  );
}

function ResultsPanel({ feedback, onReset }: { feedback: RecitationFeedback; onReset: () => void }) {
  return (
    <div className="rounded-2xl border border-emerald/30 bg-white/80 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={feedback.score} />
          <div>
            <h2 className="text-lg font-semibold">Recitation feedback</h2>
            <p className="text-sm text-ink/70">{feedback.summary}</p>
          </div>
        </div>
        <button
          onClick={onReset}
          className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium hover:bg-ink/5"
        >
          Clear
        </button>
      </div>

      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <Stat label="Correct words" value={countStatus(feedback, "correct")} tone="good" />
        <Stat label="Needs work" value={countStatus(feedback, "wrong")} tone="bad" />
        <Stat label="Skipped" value={countStatus(feedback, "missing")} tone="warn" />
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink/60">What we heard (transcript)</summary>
        <p className="ayah mt-2 text-xl" dir="rtl">
          {feedback.transcript}
        </p>
        <p className="mt-1 text-xs text-ink/40">
          Recognised free, on your device. Speech recognition can misread classical Arabic — if a
          word is marked wrong but you said it right, it may be the recogniser, not you.
        </p>
      </details>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 85 ? "#0f766e" : score >= 60 ? "#d97706" : "#dc2626";
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
      style={{ backgroundColor: tone }}
    >
      {score}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "warn";
}) {
  const color =
    tone === "good" ? "text-emerald" : tone === "bad" ? "text-red-600" : "text-amber-600";
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-ink/60">{label}</div>
    </div>
  );
}

function countStatus(feedback: RecitationFeedback, status: WordStatus): number {
  return feedback.alignment.words.filter((w) => w.status === status).length;
}

function formatTime(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
