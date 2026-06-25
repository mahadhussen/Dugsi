"use client";

import { useCallback, useRef, useState } from "react";
import SurahView from "./SurahView";
import type { RecitationFeedback } from "@/lib/analyze";
import type { WordStatus } from "@/lib/align";

type Phase = "idle" | "recording" | "processing" | "done" | "error";

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

export default function Reciter() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RecitationFeedback | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startRecording = useCallback(async () => {
    setError(null);
    setFeedback(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanupStream();
        void uploadRecording(blob, mimeType);
      };

      recorder.start();
      recorderRef.current = recorder;
      setPhase("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Microphone access was denied. Please allow the mic and try again.");
      setPhase("error");
    }
  }, []);

  const stopRecording = useCallback(() => {
    stopTimer();
    setPhase("processing");
    recorderRef.current?.stop();
  }, []);

  const uploadRecording = useCallback(async (blob: Blob, mimeType: string) => {
    try {
      const form = new FormData();
      form.append("audio", blob, "recitation.webm");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong while analysing your recitation.");
        setPhase("error");
        return;
      }
      setFeedback(data as RecitationFeedback);
      setPhase("done");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setPhase("error");
    }
  }, []);

  const reset = () => {
    setFeedback(null);
    setError(null);
    setPhase("idle");
  };

  // Build refIndex -> status / madd maps for the SurahView overlay.
  const statuses: Record<number, WordStatus> | undefined = feedback
    ? Object.fromEntries(feedback.alignment.words.map((w) => [w.refIndex, w.status]))
    : undefined;
  const maddVerdicts = feedback
    ? Object.fromEntries(feedback.timing.checks.map((c) => [c.refIndex, c.verdict]))
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3">
        {phase !== "recording" && phase !== "processing" && (
          <button
            onClick={startRecording}
            className="rounded-full bg-emerald px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-95"
          >
            {phase === "done" || phase === "error" ? "Recite again" : "Start reciting"}
          </button>
        )}

        {phase === "recording" && (
          <button
            onClick={stopRecording}
            className="flex items-center gap-3 rounded-full bg-red-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-95"
          >
            <span className="rec-dot h-3 w-3 rounded-full bg-white" />
            Stop ({formatTime(seconds)})
          </button>
        )}

        {phase === "processing" && (
          <div className="flex items-center gap-3 text-ink/70">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
            Listening to your recitation…
          </div>
        )}

        {phase === "idle" && (
          <p className="text-sm text-ink/60">
            Tap, recite Surah Al-Fatiha aloud, then tap stop. We&apos;ll check every word.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {feedback && phase === "done" && <ResultsPanel feedback={feedback} onReset={reset} />}

      <div className="rounded-2xl border border-gold/20 bg-white/70 p-6 shadow-sm sm:p-8">
        <SurahView statuses={statuses} maddVerdicts={maddVerdicts} showTajweed={!feedback} />
      </div>
    </div>
  );
}

function ResultsPanel({
  feedback,
  onReset,
}: {
  feedback: RecitationFeedback;
  onReset: () => void;
}) {
  const rushed = feedback.timing.checks.filter((c) => c.verdict === "rushed");
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

      {rushed.length > 0 && (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Tajweed tip:</strong> {rushed.length} elongation
          {rushed.length > 1 ? "s" : ""} looked rushed. Hold the madd letters longer —
          especially the 6-count madd in <span className="font-arabic">ٱلضَّآلِّينَ</span>.
          <span className="block text-xs text-amber-700/80">
            (Timing estimate from word-level timestamps — treat as a hint.)
          </span>
        </div>
      )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink/60">What we heard (transcript)</summary>
        <p className="ayah mt-2 text-xl" dir="rtl">
          {feedback.transcript}
        </p>
        <p className="mt-1 text-xs text-ink/40">Engine: {feedback.engine}</p>
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
