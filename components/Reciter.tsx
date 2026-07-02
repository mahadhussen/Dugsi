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
import { pickBestAlternative } from "@/lib/speech/pickBest";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadFurthest, saveFurthest, logSession } from "@/lib/supabase/progress";
import { mapRefTimes, liveClipTimes, mergeClipTimes, clipForWord, type TimeRange } from "@/lib/review";
import { saveRecording } from "@/lib/recordings";
import {
  checkForPriorCrash,
  whisperDisabledByCrashes,
  markWhisperRunning,
  markWhisperFinished,
} from "@/lib/crashGuard";
import type { TimedWord } from "@/lib/tajweed/timing";
import MistakeReview, { HearYourselfButton, type Mistake } from "./MistakeReview";

type Phase = "idle" | "recording" | "processing" | "done" | "error" | "unsupported";
type ModelStatus = "idle" | "loading" | "ready" | "error";

// Above this length we skip the Whisper refinement: decoding a very long
// recording to raw PCM (plus the model's working memory) is exactly the kind of
// memory spike that gets the tab killed on iOS Safari. The live result stands,
// and the recording is still kept for "hear yourself".
const MAX_WHISPER_SECONDS = 180;

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

// iPhone/iPad Safari can't reliably run the Whisper WASM model (memory limits);
// there we only run Whisper when WebGPU is available (iOS 18+, efficient path).
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iP(hone|ad|od)/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** Whether this device can safely run the on-device Whisper refinement. */
function whisperCapable(): boolean {
  return isWhisperSupported() && (!isIOS() || webgpuAvailable()) && !whisperDisabledByCrashes();
}

/** Refinement cap: iOS gets a tighter limit — decoding long audio is what
 *  memory-kills the tab there. */
function maxWhisperSeconds(): number {
  return isIOS() ? 120 : MAX_WHISPER_SECONDS;
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
  // The user's own recording (always kept) + word timestamps when Whisper ran.
  const [recording, setRecording] = useState<{ url: string; words: TimedWord[] } | null>(null);

  // Flattened words (for verse↔word mapping) and their normalised forms (for
  // live tracking).
  const flatWords = useMemo(() => flattenAyat(ayat), [ayat]);
  const expectedNorm = useMemo(() => flatWords.map((f) => normalizeWord(f.word.uthmani)), [flatWords]);
  const expectedSet = useMemo(() => new Set(expectedNorm), [expectedNorm]);

  const clearRecording = useCallback(() => {
    setRecording((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const recognizerRef = useRef<Recognizer | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0); // mirrors `seconds` for use inside callbacks
  const liveRef = useRef("");
  const liveResultShownRef = useRef(false);
  const loggedRef = useRef(false); // one session record per recitation
  const discardRef = useRef(false); // drop the next recorder result (surah switch/unmount)
  // Live-derived word times: refIndex → seconds (on the recording clock) when the
  // live tracker passed it. Whisper-independent, so "You" playback always works.
  const liveTimesRef = useRef<Record<number, number>>({});
  const recStartRef = useRef(0);
  const [liveClips, setLiveClips] = useState<Record<number, TimeRange>>({});

  // Stop the mic/recorder without processing the result (surah switch, unmount).
  const discardCapture = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      discardRef.current = true;
      try {
        recorderRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    checkForPriorCrash(); // if a past Whisper run killed the page, note it
    if (!isSpeechSupported() && !isWhisperSupported()) setPhase("unsupported");
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recognizerRef.current?.cancel();
      discardCapture();
    };
  }, [discardCapture]);

  // When the practice target (surah/section) changes, clear any prior result.
  useEffect(() => {
    recognizerRef.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
    discardCapture();
    setFeedback(null);
    setError(null);
    setLiveText("");
    liveRef.current = "";
    setLiveStatuses({});
    setLivePointer(0);
    clearRecording();
    setPhase((p) => (p === "unsupported" ? p : "idle"));
  }, [ayat, clearRecording, discardCapture]);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startTimer = () => {
    setSeconds(0);
    secondsRef.current = 0;
    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
  };

  // The live (Web Speech) recogniser drives the real-time green highlighting and
  // provides the instant result at stop; Whisper refines it afterwards when the
  // device supports it. Live hiccups are never fatal — the recording still is
  // the source of truth for the final analysis.
  const makeLiveRecognizer = (): Recognizer => {
    setLiveText("");
    liveRef.current = "";
    let lastTrack = 0;
    // Incremental tracking: only newly appended tokens are matched each tick, so
    // the work per update stays constant no matter how long the recitation gets
    // (re-matching the whole transcript grew unbounded on long surahs).
    let processedTokens = 0;
    let trackPointer = 0;
    return new Recognizer({
      // When the engine offers alternatives, take the one closest to this surah's
      // wording — noticeably better live matching for Quranic Arabic.
      pickBest: (alts) => pickBestAlternative(alts, expectedSet),
      onTranscript: (text) => {
        liveRef.current = text;
        // Show only the tail on screen — rendering an ever-growing paragraph is
        // wasted layout work during long recitations.
        const words = text.split(" ");
        setLiveText(words.length > 25 ? "… " + words.slice(-25).join(" ") : text);
        // Light throttle to coalesce bursts (rendering is virtualised + memoised,
        // so we can update often and keep up with fast reading).
        const now = Date.now();
        if (now - lastTrack < 60) return;
        lastTrack = now;
        const tokens = tokenize(text);
        if (tokens.length <= processedTokens) return; // interim revision — wait for growth
        const { statuses, pointer } = trackLive(
          expectedNorm,
          tokens.slice(processedTokens),
          trackPointer,
        );
        processedTokens = tokens.length;
        const prevPointer = trackPointer;
        trackPointer = Math.max(trackPointer, pointer);
        // Stamp when each newly passed word was reached (recording clock).
        if (recStartRef.current > 0) {
          const tSec = (Date.now() - recStartRef.current) / 1000;
          for (let i = prevPointer; i < trackPointer; i++) {
            if (liveTimesRef.current[i] === undefined) liveTimesRef.current[i] = tSec;
          }
        }

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
      onError: () => {
        /* live hiccups are non-fatal — the recording carries the result */
      },
      onDone: () => {
        /* the final result is produced in stop()/processAccurate */
      },
    });
  };

  // Finalise from the live transcript when Whisper isn't run (not capable, or
  // the recording was too long to decode safely).
  const finalizeFromLive = () => {
    if (liveResultShownRef.current) return; // stop() already showed the result
    const live = liveRef.current.trim();
    if (live) {
      setFeedback(analyzeRecitation(ayat, live, [], "on-device speech"));
      setPhase("done");
    } else {
      setError("We couldn't hear any recitation. Please try again in a quieter place.");
      setPhase("error");
    }
  };

  // One automatic engine for everyone: record the mic (always — powers "hear
  // yourself"), mark words live via the browser recogniser, and refine with
  // on-device Whisper afterwards when the device supports it.
  const startCapture = async () => {
    // The recorder is best-effort: if the mic stream fails but the browser
    // recogniser works, reciting still functions (just without playback).
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
        chunksRef.current = []; // free the buffered audio
        if (discardRef.current) {
          discardRef.current = false;
          return;
        }
        // Keep the recording no matter what happens next — in memory for this
        // session, and on-device so "hear yourself" works in the history too.
        // Clip times come from the live tracker (always available); Whisper
        // overwrites them with precise ones when it runs.
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setRecording((prev) => {
            if (prev) URL.revokeObjectURL(prev.url);
            return { url, words: [] };
          });
          void saveRecording(surahNumber, blob, liveClipTimes(liveTimesRef.current), Date.now());
        }
        if (whisperCapable() && blob.size > 0 && secondsRef.current <= maxWhisperSeconds()) {
          void processAccurate(blob);
        } else {
          finalizeFromLive();
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      recStartRef.current = Date.now();
    } catch {
      recorderRef.current = null;
      recStartRef.current = 0;
      if (!isSpeechSupported()) {
        setError("Microphone access was denied. Please allow the mic and try again.");
        setPhase("error");
        return;
      }
    }

    // Live marking via the browser recogniser, in parallel with the recording.
    if (isSpeechSupported()) {
      try {
        const live = makeLiveRecognizer();
        recognizerRef.current = live;
        live.start("ar-SA");
      } catch {
        /* no live marking — the recording still produces the result */
      }
    }
    setPhase("recording");
    startTimer();
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
      // Breadcrumb: if the tab is memory-killed during this call, the next app
      // start sees it and (after repeats) disables Whisper on this device.
      markWhisperRunning();
      const result = await transcribeWithWhisper(blob, (p) => {
        if (p.stage === "loading-model" && typeof p.percent === "number") {
          setModelStatus("loading");
          setModelPercent(p.percent);
          if (!hadLive) setProgress(`Downloading the recitation model… ${p.percent}%`);
        } else if (p.stage === "transcribing" && !hadLive) {
          setProgress("Transcribing your recitation…");
        }
      });
      markWhisperFinished();
      setModelStatus("ready");
      // Upgrade the kept recording with word-level timings so the per-verse "You"
      // playback can line up with each mistake.
      if (result.words?.length) {
        setRecording((prev) => (prev ? { ...prev, words: result.words } : prev));
      }
      if (result.text.trim()) {
        const fb = analyzeRecitation(ayat, result.text, result.words, "on-device Whisper");
        setFeedback(fb);
        setPhase("done");
        // Re-save with precise Whisper word times layered over the live-derived
        // ones, so the history review can replay each mistaken word exactly.
        if (blob.size > 0 && result.words?.length) {
          const precise = mapRefTimes(
            fb.alignment.words.map((w) => ({ refIndex: w.refIndex, heard: w.heard })),
            result.words,
          );
          const merged = mergeClipTimes(precise, liveClipTimes(liveTimesRef.current));
          void saveRecording(surahNumber, blob, merged, Date.now());
        }
      } else if (!hadLive) {
        setError("We couldn't hear any recitation. Please try again in a quieter place.");
        setPhase("error");
      }
    } catch {
      // Whisper failed (e.g. couldn't load / not enough memory). Fall back to
      // the live transcript — never leave the reciter with nothing.
      markWhisperFinished();
      setModelStatus("error");
      finalizeFromLive();
    } finally {
      setProgress(null);
    }
  };

  const start = () => {
    setError(null);
    setFeedback(null);
    setLiveStatuses({});
    setLivePointer(0);
    clearRecording();
    liveResultShownRef.current = false;
    loggedRef.current = false;
    discardRef.current = false;
    liveTimesRef.current = {};
    recStartRef.current = 0;
    setLiveClips({});
    void startCapture();
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
    recognizerRef.current?.cancel(); // stop the live recogniser
    setLiveClips(liveClipTimes(liveTimesRef.current)); // for per-word "You" playback
    // Show the instant result from the live transcript right away, so finishing
    // always shows something even if the refinement is slow or fails.
    const live = liveRef.current.trim();
    if (live) {
      liveResultShownRef.current = true;
      setFeedback(analyzeRecitation(ayat, live, [], "on-device speech"));
      setPhase("done");
    } else {
      liveResultShownRef.current = false;
      setPhase("processing");
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // → onstop keeps the recording and refines/finalises
    } else if (!live) {
      // No recorder and nothing heard live — don't get stuck on a spinner.
      setError("We couldn't hear any recitation. Please try again in a quieter place.");
      setPhase("error");
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

  // Per-mistake review. "You" replays the mistaken word from the recording:
  // precise Whisper times when available, otherwise the live tracker's window —
  // and skipped words play the passage around them (they were never spoken).
  const mistakes = useMemo<Mistake[]>(() => {
    if (!feedback) return [];
    const precise = mapRefTimes(
      feedback.alignment.words.map((w) => ({ refIndex: w.refIndex, heard: w.heard })),
      recording?.words ?? [],
    );
    const times = mergeClipTimes(precise, liveClips);
    return feedback.alignment.words
      .filter((w) => w.status === "wrong" || w.status === "missing")
      .slice(0, 30)
      .map((w) => {
        const fw = flatWords[w.refIndex];
        return {
          refIndex: w.refIndex,
          uthmani: fw?.word.uthmani ?? w.expected,
          translit: fw?.word.translit,
          heard: w.heard,
          verse: fw?.ayah ?? 1,
          skipped: w.status === "missing",
          time: clipForWord(times, w.refIndex),
        };
      });
  }, [feedback, recording, liveClips, flatWords]);

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

  return (
    <div className="space-y-6">
      <EngineStatus modelStatus={modelStatus} modelPercent={modelPercent} />

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

/** No modes to choose any more — the best available engine is picked
 *  automatically. This line just tells the reciter what their device does. */
function EngineStatus({ modelStatus, modelPercent }: { modelStatus: ModelStatus; modelPercent: number }) {
  const capable = typeof window !== "undefined" && whisperCapable();
  const disabled = typeof window !== "undefined" && whisperDisabledByCrashes();
  return (
    <p className="text-center text-xs text-ink/50">
      {modelStatus === "loading"
        ? `Preparing the precise on-device check… ${modelPercent}%`
        : capable
          ? "Live word marking + your recording, refined by a precise on-device check."
          : disabled
            ? "Live word marking + your recording. The precise check is off — it crashed on this device."
            : "Live word marking + your recording — free, on your device."}
    </p>
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
