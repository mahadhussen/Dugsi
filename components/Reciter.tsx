"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SurahView from "./SurahView";
import { Recognizer, isSpeechSupported } from "@/lib/speech/recognizer";
import { transcribeWithWhisper, isWhisperSupported, webgpuAvailable } from "@/lib/speech/whisperLocal";
import { analyzeRecitation, type RecitationFeedback } from "@/lib/analyze";
import type { WordStatus } from "@/lib/align";
import { type Ayah, flattenAyat } from "@/lib/quran/types";
import { tokenize, normalizeWord } from "@/lib/arabic";
import { trackLive } from "@/lib/live";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadFurthest, saveFurthest, logSession } from "@/lib/supabase/progress";
import { mapRefTimes } from "@/lib/review";
import type { TimedWord } from "@/lib/tajweed/timing";
import MistakeReview, { HearYourselfButton, type Mistake } from "./MistakeReview";

type Phase = "idle" | "recording" | "processing" | "done" | "error" | "unsupported";
type Engine = "fast" | "accurate";
type ModelStatus = "idle" | "loading" | "ready" | "error";

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" fill="currentColor" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
}

// iPhone/iPad Safari can't reliably run the Whisper WASM model (memory limits),
// so High accuracy there uses the browser recogniser instead of crashing.
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iP(hone|ad|od)/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export default function Reciter({
  ayat,
  surahNumber,
  trackProgress = false,
}: {
  ayat: Ayah[];
  surahNumber: number;
  trackProgress?: boolean;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [phase, setPhase] = useState<Phase>("idle");
  const [engine, setEngine] = useState<Engine>("fast");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RecitationFeedback | null>(null);
  const [liveText, setLiveText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelPercent, setModelPercent] = useState(0);
  const [liveStatuses, setLiveStatuses] = useState<Record<number, WordStatus>>({});
  const [livePointer, setLivePointer] = useState(0);
  const [hifz, setHifz] = useState(0); // 0 = off, 1 easy, 2 medium, 3 hide all
  // The user's own recording + word timestamps, to replay mistakes (High accuracy).
  const [recording, setRecording] = useState<{ url: string; words: TimedWord[] } | null>(null);

  // Flattened words (for verse↔word mapping) and their normalised forms (for
  // live tracking).
  const flatWords = useMemo(() => flattenAyat(ayat), [ayat]);
  const expectedNorm = useMemo(() => flatWords.map((f) => normalizeWord(f.word.uthmani)), [flatWords]);

  const clearRecording = useCallback(() => {
    setRecording((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const fastOk = useRef(true);
  const recognizerRef = useRef<Recognizer | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveRef = useRef("");
  const liveResultShownRef = useRef(false);
  const loggedRef = useRef(false); // one session record per recitation

  useEffect(() => {
    const fast = isSpeechSupported();
    const accurate = isWhisperSupported();
    fastOk.current = fast;
    if (!fast && !accurate) setPhase("unsupported");
    else if (!fast && accurate) setEngine("accurate");
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recognizerRef.current?.cancel();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // When the practice target (surah/section) changes, clear any prior result.
  useEffect(() => {
    recognizerRef.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    setFeedback(null);
    setError(null);
    setLiveText("");
    liveRef.current = "";
    setLiveStatuses({});
    setLivePointer(0);
    clearRecording();
    setPhase((p) => (p === "unsupported" ? p : "idle"));
  }, [ayat, clearRecording]);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  // Just switch engine. The Whisper model is NOT preloaded here — loading a
  // WASM ML model in the background is a likely memory spike on phones; it now
  // loads only when the user actually records in High-accuracy mode.
  const selectEngine = (next: Engine) => {
    if (phase === "recording" || phase === "processing") return;
    setEngine(next);
    setFeedback(null);
    setError(null);
    setPhase("idle");
  };

  const startTimer = () => {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  // The live (Web Speech) recogniser drives the real-time green/red highlighting.
  // In Fast mode it also produces the final result; in High-accuracy mode it only
  // powers the live marking while Whisper computes the precise final score.
  const makeLiveRecognizer = (useForFinal: boolean): Recognizer => {
    setLiveText("");
    liveRef.current = "";
    let lastTrack = 0;
    return new Recognizer({
      onTranscript: (text) => {
        liveRef.current = text;
        setLiveText(text);
        // Light throttle to coalesce bursts (rendering is virtualised + memoised,
        // so we can update often and keep up with fast reading).
        const now = Date.now();
        if (now - lastTrack < 60) return;
        lastTrack = now;
        const { statuses, pointer } = trackLive(expectedNorm, tokenize(text));

        // Merge forward-only and sticky: once a word is green it stays green, and
        // the cursor never moves backward. This makes the marking consistent and
        // smooth instead of flickering as the recogniser revises interim results.
        setLiveStatuses((prev) => {
          let out = prev;
          for (const key in statuses) {
            const idx = Number(key);
            const next = statuses[idx];
            const cur = prev[idx];
            if (cur === undefined || (cur === "close" && next === "correct")) {
              if (out === prev) out = { ...prev };
              out[idx] = next;
            }
          }
          return out;
        });
        setLivePointer((prev) => (pointer > prev ? pointer : prev));
        if (trackProgress) {
          const verse = flatWords[Math.min(flatWords.length - 1, pointer)]?.ayah;
          if (verse) saveFurthest(userId, surahNumber, verse);
        }
      },
      onError: (message) => {
        if (!useForFinal) return; // a live hiccup in accurate mode is non-fatal
        stopTimer();
        setError(message);
        setPhase("error");
      },
      onDone: (finalText) => {
        if (!useForFinal) return; // Whisper produces the result in accurate mode
        stopTimer();
        const transcript = finalText || liveRef.current;
        if (!transcript.trim()) {
          setError("We couldn't hear any recitation. Please try again in a quieter place.");
          setPhase("error");
          return;
        }
        setFeedback(analyzeRecitation(ayat, transcript, [], "on-device speech"));
        setPhase("done");
      },
    });
  };

  const startFast = () => {
    const recognizer = makeLiveRecognizer(true);
    recognizerRef.current = recognizer;
    recognizer.start("ar-SA");
    setPhase("recording");
    startTimer();
    // Best-effort: also capture the audio so the reciter can replay themselves
    // afterwards (the browser recogniser gives text but no recording).
    void captureAudio();
  };

  // Record the mic to a blob in parallel (used for "hear yourself"). Failure is
  // non-fatal — the recitation/recognition still works without it.
  const captureAudio = async () => {
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
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setRecording((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return { url, words: [] }; // no word timings in Fast mode
          });
        }
      };
      recorder.start();
      recorderRef.current = recorder;
    } catch {
      /* no playback this time — recitation still works */
    }
  };

  const startAccurate = async () => {
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
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        void processAccurate(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setPhase("recording");
      startTimer();

      // Best-effort live marking via the browser recogniser, in parallel.
      if (isSpeechSupported()) {
        try {
          const live = makeLiveRecognizer(false);
          recognizerRef.current = live;
          live.start("ar-SA");
        } catch {
          /* concurrent live not available — Whisper still gives the result */
        }
      }
    } catch {
      setError("Microphone access was denied. Please allow the mic and try again.");
      setPhase("error");
    }
  };

  const processAccurate = async (blob: Blob) => {
    // If we already showed an instant result from the browser recogniser, Whisper
    // just refines it in the background and must never remove it.
    const hadLive = liveResultShownRef.current;
    if (!hadLive) {
      setPhase("processing");
      setProgress("Transcribing your recitation…");
    }
    try {
      const result = await transcribeWithWhisper(blob, (p) => {
        if (hadLive) return; // refine silently
        if (p.stage === "loading-model" && typeof p.percent === "number") {
          setModelPercent(p.percent);
          setProgress(`Downloading the recitation model… ${p.percent}%`);
        } else if (p.stage === "transcribing") {
          setProgress("Transcribing your recitation…");
        }
      });
      setModelStatus("ready");
      // Always keep the recording so "Hear yourself" is available, even if Whisper
      // returned no per-word timestamps (then only whole-recitation playback).
      if (blob.size > 0) {
        const url = URL.createObjectURL(blob);
        setRecording((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url, words: result.words ?? [] };
        });
      }
      if (result.text.trim()) {
        setFeedback(analyzeRecitation(ayat, result.text, result.words, "on-device Whisper"));
        setPhase("done");
      } else if (!hadLive) {
        setError("We couldn't hear any recitation. Please try again in a quieter place.");
        setPhase("error");
      }
    } catch {
      // Whisper failed (e.g. couldn't load / not enough memory). Keep the live
      // result if we have one; otherwise fall back to it, or show an error.
      if (!hadLive) {
        const live = liveRef.current.trim();
        if (live) {
          setFeedback(analyzeRecitation(ayat, live, [], "on-device speech"));
          setPhase("done");
        } else {
          setError("Couldn't analyse the recitation. Please try again, or use Fast mode.");
          setPhase("error");
        }
      }
    } finally {
      setProgress(null);
    }
  };

  // Whether to actually run on-device Whisper. On iOS we only do it when WebGPU
  // is available (newer iPhones, iOS 18+) and run on WebGPU — that's efficient
  // and avoids the WASM out-of-memory crash. Older iPhones keep the browser
  // recogniser as the final result.
  const whisperMode = engine === "accurate" && (!isIOS() || webgpuAvailable());

  const start = () => {
    setError(null);
    setFeedback(null);
    setLiveStatuses({});
    setLivePointer(0);
    clearRecording();
    liveResultShownRef.current = false;
    loggedRef.current = false;
    if (whisperMode) void startAccurate();
    else startFast();
  };

  // Resume point (from the account or this device) and a stable progress writer.
  // Scrolling/active-follow are handled by the virtualised list itself.
  const [initialTopVerse, setInitialTopVerse] = useState(0);
  useEffect(() => {
    if (!trackProgress) {
      setInitialTopVerse(0);
      return;
    }
    let cancelled = false;
    loadFurthest(userId, surahNumber).then((v) => !cancelled && setInitialTopVerse(v));
    return () => {
      cancelled = true;
    };
  }, [trackProgress, surahNumber, userId]);
  const handleTopVerseChange = useCallback(
    (verse: number) => {
      if (trackProgress) saveFurthest(userId, surahNumber, verse);
    },
    [trackProgress, userId, surahNumber],
  );

  const stop = () => {
    stopTimer();
    if (!whisperMode) {
      setPhase("done");
      recognizerRef.current?.stop();
      recorderRef.current?.stop(); // finalise the "hear yourself" recording
    } else {
      recognizerRef.current?.cancel(); // stop the live recogniser
      // Show the instant browser-recogniser result right away, so finishing
      // always shows something even if Whisper is slow or fails on this phone.
      const live = liveRef.current.trim();
      if (live) {
        liveResultShownRef.current = true;
        setFeedback(analyzeRecitation(ayat, live, [], "on-device speech"));
        setPhase("done");
      } else {
        liveResultShownRef.current = false;
        setPhase("processing");
      }
      recorderRef.current?.stop(); // → processAccurate refines (or sets) the result
    }
  };

  const reset = () => {
    setFeedback(null);
    setError(null);
    setLiveText("");
    clearRecording();
    setPhase("idle");
  };

  const statuses: Record<number, WordStatus> | undefined = useMemo(
    () =>
      feedback
        ? Object.fromEntries(feedback.alignment.words.map((w) => [w.refIndex, w.status]))
        : undefined,
    [feedback],
  );
  const maddVerdicts = useMemo(
    () =>
      feedback
        ? Object.fromEntries(feedback.timing.checks.map((c) => [c.refIndex, c.verdict]))
        : undefined,
    [feedback],
  );

  // Per-mistake review: wrong/skipped words. "You" plays back the whole verse the
  // reciter said (more useful + robust than one word) so it lines up with the qari
  // verse for a real side-by-side comparison.
  const mistakes = useMemo<Mistake[]>(() => {
    if (!feedback) return [];
    const times = mapRefTimes(
      feedback.alignment.words.map((w) => ({ refIndex: w.refIndex, heard: w.heard })),
      recording?.words ?? [],
    );
    // The span of the recording covering each verse (min start … max end of its
    // spoken words).
    const verseTime: Record<number, { start: number; end: number }> = {};
    for (const w of feedback.alignment.words) {
      const t = times[w.refIndex];
      const ayah = flatWords[w.refIndex]?.ayah;
      if (!t || ayah == null) continue;
      const cur = verseTime[ayah];
      verseTime[ayah] = cur
        ? { start: Math.min(cur.start, t.start), end: Math.max(cur.end, t.end) }
        : { start: t.start, end: t.end };
    }
    return feedback.alignment.words
      .filter((w) => w.status === "wrong" || w.status === "missing")
      .slice(0, 30)
      .map((w) => {
        const fw = flatWords[w.refIndex];
        const verse = fw?.ayah ?? 1;
        return {
          refIndex: w.refIndex,
          uthmani: fw?.word.uthmani ?? w.expected,
          translit: fw?.word.translit,
          heard: w.heard,
          verse,
          skipped: w.status === "missing",
          time: verseTime[verse] ?? times[w.refIndex],
        };
      });
  }, [feedback, recording, flatWords]);

  // Record one session per finished recitation (signed-in only). The first
  // finalised result wins; a later Whisper refinement won't double-log.
  useEffect(() => {
    if (phase === "done" && feedback && userId && !loggedRef.current) {
      loggedRef.current = true;
      const missed = feedback.alignment.words
        .filter((w) => w.status === "wrong" || w.status === "missing")
        .slice(0, 40)
        .map((w) => ({ i: w.refIndex, h: w.heard }));
      logSession(userId, {
        surah: surahNumber,
        score: feedback.score,
        correct: countStatus(feedback, "correct"),
        wrong: countStatus(feedback, "wrong"),
        missing: countStatus(feedback, "missing"),
        mistakes: missed,
      });
    }
  }, [phase, feedback, userId, surahNumber]);

  // Live word-by-word following now runs in both engines (Fast directly, High
  // accuracy via a concurrent browser recogniser). Keep the live marks visible
  // through the short "processing" step in accurate mode until the final lands.
  const liveMode = phase === "recording";
  const showingLive = (phase === "recording" || phase === "processing") && !feedback;

  // Memoise the surah so the (frequent) live-transcript text updates don't
  // re-invoke it — it only rebuilds when statuses / cursor / target actually change.
  const surahEl = useMemo(
    () => (
      <SurahView
        ayat={ayat}
        surahNumber={surahNumber}
        statuses={showingLive ? liveStatuses : statuses}
        maddVerdicts={maddVerdicts}
        activeIndex={liveMode ? livePointer : undefined}
        showTajweed={!showingLive && !feedback}
        maskLevel={hifz}
        initialTopVerse={initialTopVerse}
        onTopVerseChange={handleTopVerseChange}
      />
    ),
    [
      ayat,
      surahNumber,
      showingLive,
      liveStatuses,
      statuses,
      maddVerdicts,
      liveMode,
      livePointer,
      feedback,
      hifz,
      initialTopVerse,
      handleTopVerseChange,
    ],
  );

  if (phase === "unsupported") {
    return (
      <div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your browser doesn&apos;t support on-device recitation yet. Open Dugsi in{" "}
          <strong>Google Chrome</strong> (or Safari on iPhone) to use voice feedback — you can still
          read the surah and tajweed guide below.
        </div>
        <SurahCard>
          <SurahView ayat={ayat} surahNumber={surahNumber} showTajweed />
        </SurahCard>
      </div>
    );
  }

  const busy = phase === "recording" || phase === "processing";

  return (
    <div className="space-y-6">
      <EngineToggle
        engine={engine}
        onSelect={selectEngine}
        disabled={busy}
        fastOk={fastOk.current}
        modelStatus={modelStatus}
        modelPercent={modelPercent}
        usesBrowserOnly={engine === "accurate" && !whisperMode}
      />

      <HifzToggle level={hifz} onSelect={setHifz} />

      {/* Recorder */}
      <div className="flex flex-col items-center gap-4">
        {phase === "recording" ? (
          <button onClick={stop} className="relative grid h-24 w-24 place-items-center" aria-label="Stop reciting">
            <span className="absolute inset-0 animate-ring rounded-full bg-red-500/40" />
            <span className="absolute inset-0 rounded-full bg-red-500/15" />
            <span className="relative grid h-20 w-20 place-items-center rounded-full bg-red-600 text-white shadow-soft transition active:scale-95">
              <span className="h-6 w-6 rounded-md bg-white" />
            </span>
          </button>
        ) : (
          <button
            onClick={start}
            disabled={phase === "processing"}
            className="group relative grid h-24 w-24 place-items-center disabled:opacity-60"
            aria-label="Start reciting"
          >
            <span className="absolute inset-0 rounded-full bg-emerald/10 transition group-hover:bg-emerald/20" />
            <span className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-b from-emerald to-emerald-deep text-white shadow-soft ring-4 ring-emerald/15 transition group-active:scale-95">
              {phase === "processing" ? (
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <MicIcon className="h-9 w-9" />
              )}
            </span>
          </button>
        )}

        {phase === "recording" ? (
          <div className="flex items-center gap-2 text-sm font-medium text-red-600">
            <span className="rec-dot h-2.5 w-2.5 rounded-full bg-red-600" />
            Listening · {formatTime(seconds)} · tap to stop
          </div>
        ) : phase === "processing" ? (
          <p className="text-center text-sm text-ink/60">{progress ?? "Working…"}</p>
        ) : (
          <p className="text-center text-sm text-ink/60">
            {phase === "done" || phase === "error"
              ? "Tap to recite again"
              : "Tap the mic, recite the verses aloud, then tap to stop."}
          </p>
        )}

        {phase === "recording" && (
          <div className="w-full animate-in rounded-2xl border border-emerald/25 bg-white/80 p-4 text-center shadow-soft">
            <p className="ayah text-2xl text-ink/80" dir="rtl">
              {liveText || "…"}
            </p>
            <p className="mt-1 text-xs text-ink/40">Recite at your own pace.</p>
          </div>
        )}
      </div>

      {error && (
        <div className="animate-in rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {feedback && phase === "done" && (
        <ResultsPanel
          feedback={feedback}
          onReset={reset}
          mistakes={mistakes}
          surahNumber={surahNumber}
          recordingUrl={recording?.url}
        />
      )}

      <SurahCard>{surahEl}</SurahCard>
    </div>
  );
}

function EngineToggle({
  engine,
  onSelect,
  disabled,
  fastOk,
  modelStatus,
  modelPercent,
  usesBrowserOnly,
}: {
  engine: Engine;
  onSelect: (e: Engine) => void;
  disabled: boolean;
  fastOk: boolean;
  modelStatus: ModelStatus;
  modelPercent: number;
  usesBrowserOnly: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="inline-flex rounded-full border border-gold/30 bg-white/70 p-1 text-sm shadow-soft">
        <button
          onClick={() => onSelect("fast")}
          disabled={disabled || !fastOk}
          className={`rounded-full px-4 py-1.5 font-medium transition disabled:opacity-40 ${
            engine === "fast" ? "bg-emerald text-white shadow" : "text-ink/70 hover:text-ink"
          }`}
        >
          Fast
        </button>
        <button
          onClick={() => onSelect("accurate")}
          disabled={disabled}
          className={`rounded-full px-4 py-1.5 font-medium transition disabled:opacity-40 ${
            engine === "accurate" ? "bg-emerald text-white shadow" : "text-ink/70 hover:text-ink"
          }`}
        >
          High accuracy
        </button>
      </div>
      <p className="text-center text-xs text-ink/50">
        {engine === "fast"
          ? "Instant · live following. Uses your browser's speech recognition."
          : usesBrowserOnly
            ? "Live marking · uses your browser's recogniser on this device."
            : modelStatus === "loading"
              ? `Preparing on-device check… ${modelPercent}%`
              : modelStatus === "ready"
                ? "Live marking + a precise on-device check at the end."
                : modelStatus === "error"
                  ? "Couldn't load the model — needs internet the first time."
                  : "Live marking, plus a precise on-device check. Small one-time download."}
      </p>
    </div>
  );
}

function HifzToggle({ level, onSelect }: { level: number; onSelect: (l: number) => void }) {
  const options: { value: number; label: string }[] = [
    { value: 0, label: "Off" },
    { value: 1, label: "Easy" },
    { value: 2, label: "Medium" },
    { value: 3, label: "Hard" },
  ];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="inline-flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">Memorise</span>
        <div className="inline-flex rounded-full border border-gold/30 bg-white/70 p-1 text-sm shadow-soft">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => onSelect(o.value)}
              className={`rounded-full px-3.5 py-1.5 font-medium transition ${
                level === o.value ? "bg-gold text-white shadow" : "text-ink/70 hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {level > 0 && (
        <p className="max-w-md text-center text-xs text-ink/50">
          Hidden words reveal as you recite them correctly — or tap a word to peek. Hit the mic and
          recite from memory.
        </p>
      )}
    </div>
  );
}

function SurahCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gold/25 bg-white/75 p-6 shadow-soft backdrop-blur-sm sm:p-8">
      {children}
    </div>
  );
}

function ResultsPanel({
  feedback,
  onReset,
  mistakes,
  surahNumber,
  recordingUrl,
}: {
  feedback: RecitationFeedback;
  onReset: () => void;
  mistakes: Mistake[];
  surahNumber: number;
  recordingUrl?: string;
}) {
  const rushed = feedback.timing.checks.filter((c) => c.verdict === "rushed");
  return (
    <div className="animate-in rounded-2xl border border-emerald/25 bg-white/85 p-6 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <ScoreRing score={feedback.score} />
          <div>
            <h2 className="text-lg font-bold text-ink">Recitation feedback</h2>
            <p className="text-sm text-ink/70">{feedback.summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <HearYourselfButton recordingUrl={recordingUrl} />
          <button
            onClick={onReset}
            className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium text-ink/80 transition hover:bg-ink/5"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <Stat label="Correct words" value={countStatus(feedback, "correct")} tone="good" />
        <Stat label="Needs work" value={countStatus(feedback, "wrong")} tone="bad" />
        <Stat label="Skipped" value={countStatus(feedback, "missing")} tone="warn" />
      </div>

      {rushed.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <strong>Tajweed tip:</strong> {rushed.length} elongation{rushed.length > 1 ? "s" : ""}{" "}
          looked rushed (marked ⏱ below). Hold the madd letters longer — especially the 6-count madd
          in <span className="font-arabic">ٱلضَّآلِّينَ</span>.
          <span className="block text-xs text-amber-700/80">
            Timing estimate from word-level timestamps — treat it as a hint.
          </span>
        </div>
      )}

      <MistakeReview mistakes={mistakes} surahNumber={surahNumber} recordingUrl={recordingUrl} />

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-ink/55 transition hover:text-ink/80">
          What we heard (transcript)
        </summary>
        <p className="ayah mt-2 text-xl" dir="rtl">
          {feedback.transcript}
        </p>
        <p className="mt-1 text-xs text-ink/40">
          Recognised free, on your device ({feedback.engine}). Recognition can misread classical
          Arabic — if a word is marked wrong but you said it right, it may be the recogniser, not you.
        </p>
      </details>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? "#0f766e" : score >= 60 ? "#d97706" : "#dc2626";
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#e7e1d3" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-lg font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "#0f766e" : tone === "bad" ? "#dc2626" : "#d97706";
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-3 text-center sm:text-left">
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
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
