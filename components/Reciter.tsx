"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SurahView, { isMaskedSlot } from "./SurahView";
import { Recognizer, isSpeechSupported } from "@/lib/speech/recognizer";
import {
  transcribeWithWhisper,
  isWhisperSupported,
  webgpuAvailable,
  pickWhisperModel,
  type WhisperModel,
} from "@/lib/speech/whisperLocal";
import { startVad, HESITATION_MS, type VadHandle, type Hesitation } from "@/lib/speech/vad";
import { analyzeRecitation, type RecitationFeedback } from "@/lib/analyze";
import type { WordStatus } from "@/lib/align";
import { type Ayah, flattenAyat } from "@/lib/quran/types";
import { tokenize, normalizeWord } from "@/lib/arabic";
import { trackLive, mergeLiveStatuses } from "@/lib/live";
import { useSettings, updateSettings } from "@/lib/settings";
import { surahMeta } from "@/lib/quran";
import { pickBestAlternative } from "@/lib/speech/pickBest";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadFurthest, saveFurthest, logSession } from "@/lib/supabase/progress";
import {
  mapRefTimes,
  liveClipTimes,
  mergeClipTimes,
  clipForMistake,
  sanePreciseTimes,
  type TimeRange,
} from "@/lib/review";
import { saveRecording } from "@/lib/recordings";
import {
  checkForPriorCrash,
  whisperDisabledByCrashes,
  markWhisperRunning,
  markWhisperFinished,
  clearCrashBreadcrumb,
  reEnableWhisper,
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
  startVerse,
}: {
  ayat: Ayah[];
  surahNumber: number;
  trackProgress?: boolean;
  /** Scroll to this 1-based verse first (e.g. a bookmark or a mistake to practise). */
  startVerse?: number;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const settings = useSettings();
  const liveMistakesRef = useRef(settings.liveMistakes);
  liveMistakesRef.current = settings.liveMistakes;
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<RecitationFeedback | null>(null);
  const [liveText, setLiveText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelPercent, setModelPercent] = useState(0);
  const [modelInUse, setModelInUse] = useState<WhisperModel | null>(null);
  // Voice activity: long mid-recitation pauses (memorisation weak spots) and
  // the optional auto-stop. Best-effort — absent when the VAD can't load.
  const vadRef = useRef<VadHandle | null>(null);
  const hesitationsRef = useRef<Hesitation[]>([]);
  const [hesitations, setHesitations] = useState<Hesitation[]>([]);
  const pointerRef = useRef(0); // latest live pointer, readable from callbacks
  const autoStopRef = useRef(settings.autoStop);
  autoStopRef.current = settings.autoStop;
  const stopRef = useRef<() => void>(() => {});
  const [liveStatuses, setLiveStatuses] = useState<Record<number, WordStatus>>({});
  const [livePointer, setLivePointer] = useState(0);
  const [liveExtras, setLiveExtras] = useState(0); // added words heard so far (live)
  const extrasRef = useRef(0);
  const [hifz, setHifz] = useState(0); // 0 = off, 1 easy, 2 medium, 3 hide all
  // Memorisation: hidden words the reader opened (by tap or the Peek buttons),
  // and how many times they peeked this attempt.
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const peeksRef = useRef(0);
  const reveal = useCallback((refIndex: number) => {
    setRevealed((prev) => {
      if (prev.has(refIndex)) return prev;
      const next = new Set(prev);
      next.add(refIndex);
      return next;
    });
  }, []);
  useEffect(() => {
    setRevealed(new Set());
    peeksRef.current = 0;
  }, [ayat, hifz]);
  const [engineTick, setEngineTick] = useState(0); // re-render the status line after re-enable
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
  const lastStampRef = useRef(0);
  const recStartRef = useRef(0);
  // Earliest reference word the live tracker matched — an anchor prior so a long
  // surah with a repeated phrase does not window onto the wrong repetition.
  const firstLiveMatchRef = useRef<number | undefined>(undefined);
  const [liveClips, setLiveClips] = useState<Record<number, TimeRange>>({});

  // Stop the mic/recorder without processing the result (surah switch, unmount).
  const discardCapture = useCallback(() => {
    vadRef.current?.stop();
    vadRef.current = null;
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
    // A deliberate close or backgrounding is not a crash — drop the breadcrumb so
    // it is never miscounted. A real memory kill fires neither event.
    const onLeave = () => clearCrashBreadcrumb();
    const onHide = () => {
      if (document.visibilityState === "hidden") clearCrashBreadcrumb();
    };
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onHide);
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
        const { statuses, pointer, extras } = trackLive(
          expectedNorm,
          tokens.slice(processedTokens),
          trackPointer,
          { mistakes: liveMistakesRef.current },
        );
        processedTokens = tokens.length;
        trackPointer = Math.max(trackPointer, pointer);
        if (extras > 0) {
          extrasRef.current += extras;
          setLiveExtras(extrasRef.current);
        }
        // Stamp ONLY words that actually matched this tick (never pointer nudges
        // past unheard words — those stamps would point at the wrong audio).
        // A batch of matches is spread between the previous stamp and now, since
        // the engine often commits several words at once.
        if (recStartRef.current > 0) {
          const tSec = (Date.now() - recStartRef.current) / 1000;
          const fresh: number[] = [];
          for (const key in statuses) {
            const idx = Number(key);
            // Only words actually heard carry a timestamp — a word flagged as
            // skipped or substituted was never (correctly) said at this moment.
            if (statuses[idx] !== "correct" && statuses[idx] !== "close") continue;
            if (firstLiveMatchRef.current === undefined || idx < firstLiveMatchRef.current) {
              firstLiveMatchRef.current = idx;
            }
            if (liveTimesRef.current[idx] === undefined) fresh.push(idx);
          }
          if (fresh.length > 0) {
            fresh.sort((a, b) => a - b);
            const from = lastStampRef.current;
            fresh.forEach((idx, k) => {
              liveTimesRef.current[idx] = from + ((tSec - from) * (k + 1)) / fresh.length;
            });
            lastStampRef.current = tSec;
          }
        }

        // Merge sticky: once a word is green it stays green, a word flagged
        // red recovers when re-read, and the cursor never moves backward. This
        // keeps the marking consistent and smooth instead of flickering as the
        // recogniser revises interim results.
        setLiveStatuses((prev) => mergeLiveStatuses(prev, statuses));
        setLivePointer((prev) => (pointer > prev ? pointer : prev));
        pointerRef.current = Math.max(pointerRef.current, pointer);
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
      setFeedback(analyzeRecitation(ayat, live, [], "on-device speech", firstLiveMatchRef.current));
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
      // Silero VAD on the same stream: note long pauses, and (if chosen) stop
      // by itself after a long silence. Loads from a CDN; silently absent if not.
      const AUTO_STOP_MS = 6000;
      void startVad(
        stream,
        () => (recStartRef.current > 0 ? (Date.now() - recStartRef.current) / 1000 : 0),
        {
          onSilence: (ms, tSec) => {
            if (ms === HESITATION_MS) {
              // Only a pause *inside* a recitation counts — not the run-up before
              // the first word, and not the tail after the last one.
              if (pointerRef.current > 0 && pointerRef.current < flatWords.length) {
                const h: Hesitation = { at: tSec - ms / 1000, seconds: ms / 1000, beforeRefIndex: pointerRef.current };
                hesitationsRef.current = [...hesitationsRef.current, h];
                setHesitations(hesitationsRef.current);
              }
            } else if (ms === AUTO_STOP_MS && autoStopRef.current && pointerRef.current > 0) {
              stopRef.current();
            }
          },
        },
        [HESITATION_MS, AUTO_STOP_MS],
      ).then((handle) => {
        // If the reciter already stopped while the model was loading, drop it.
        if (!handle) return;
        if (recorderRef.current !== recorder || recorder.state === "inactive") handle.stop();
        else vadRef.current = handle;
      });
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
      const result = await transcribeWithWhisper(
        blob,
        (p) => {
          if (p.model) setModelInUse(p.model);
          if (p.stage === "loading-model" && typeof p.percent === "number") {
            setModelStatus("loading");
            setModelPercent(p.percent);
            if (!hadLive) setProgress(`Downloading the ${p.model?.id === "quran" ? "Quran-tuned" : "recitation"} model… ${p.percent}%`);
          } else if (p.stage === "transcribing" && !hadLive) {
            setProgress("Transcribing your recitation…");
          }
        },
        pickWhisperModel(settings.quranModel),
      );
      markWhisperFinished();
      setModelStatus("ready");
      setModelInUse(result.model);
      // Upgrade the kept recording with word-level timings so the per-verse "You"
      // playback can line up with each mistake.
      if (result.words?.length) {
        setRecording((prev) => (prev ? { ...prev, words: result.words } : prev));
      }
      if (result.text.trim()) {
        const fb = analyzeRecitation(
          ayat,
          result.text,
          result.words,
          result.model.id === "quran" ? "on-device Whisper, Quran-tuned" : "on-device Whisper",
          firstLiveMatchRef.current,
        );
        setFeedback(fb);
        setPhase("done");
        // Re-save with precise Whisper word times layered over the live-derived
        // ones, so the history review can replay each mistaken word exactly.
        // Whisper's timestamps are sanity-checked against the real recording
        // length first — broken ones would point at the wrong audio.
        if (blob.size > 0 && result.words?.length) {
          const precise = sanePreciseTimes(
            mapRefTimes(
              fb.alignment.words.map((w) => ({ refIndex: w.refIndex, heard: w.heard })),
              result.words,
            ),
            secondsRef.current,
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
    setLiveExtras(0);
    extrasRef.current = 0;
    setRevealed(new Set()); // hide the words again for a fresh attempt
    peeksRef.current = 0;
    hesitationsRef.current = [];
    setHesitations([]);
    pointerRef.current = 0;
    clearRecording();
    liveResultShownRef.current = false;
    loggedRef.current = false;
    discardRef.current = false;
    liveTimesRef.current = {};
    lastStampRef.current = 0;
    recStartRef.current = 0;
    firstLiveMatchRef.current = undefined;
    setLiveClips({});
    void startCapture();
  };

  // Resume point (from the account or this device) and a stable progress writer.
  // Scrolling/active-follow are handled by the virtualised list itself.
  const [initialTopVerse, setInitialTopVerse] = useState(0);
  useEffect(() => {
    if (startVerse && startVerse > 0) {
      setInitialTopVerse(startVerse);
      return;
    }
    if (!trackProgress) {
      setInitialTopVerse(0);
      return;
    }
    let cancelled = false;
    loadFurthest(userId, surahNumber).then((v) => !cancelled && setInitialTopVerse(v));
    return () => {
      cancelled = true;
    };
  }, [trackProgress, surahNumber, userId, startVerse]);
  const handleTopVerseChange = useCallback(
    (verse: number) => {
      if (trackProgress) saveFurthest(userId, surahNumber, verse);
    },
    [trackProgress, userId, surahNumber],
  );

  const stop = () => {
    stopTimer();
    vadRef.current?.stop();
    vadRef.current = null;
    recognizerRef.current?.cancel(); // stop the live recogniser
    setLiveClips(liveClipTimes(liveTimesRef.current)); // for per-word "You" playback
    // Show the instant result from the live transcript right away, so finishing
    // always shows something even if the refinement is slow or fails.
    const live = liveRef.current.trim();
    if (live) {
      liveResultShownRef.current = true;
      setFeedback(analyzeRecitation(ayat, live, [], "on-device speech", firstLiveMatchRef.current));
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

  stopRef.current = stop;

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
    const precise = sanePreciseTimes(
      mapRefTimes(
        feedback.alignment.words.map((w) => ({ refIndex: w.refIndex, heard: w.heard })),
        recording?.words ?? [],
      ),
      seconds,
    );
    const times = mergeClipTimes(precise, liveClips);
    return feedback.alignment.words
      .filter((w) => w.status === "wrong" || w.status === "missing")
      .slice(0, 30)
      .map((w) => {
        const fw = flatWords[w.refIndex];
        const skipped = w.status === "missing";
        return {
          refIndex: w.refIndex,
          uthmani: fw?.word.uthmani ?? w.expected,
          translit: fw?.word.translit,
          heard: w.heard,
          verse: fw?.ayah ?? 1,
          indexInAyah: fw?.indexInAyah,
          skipped,
          time: clipForMistake(times, w.refIndex, skipped),
        };
      });
  }, [feedback, recording, liveClips, seconds, flatWords]);

  // Record one session per finished recitation (signed-in only). The first
  // finalised result wins; a later Whisper refinement won't double-log.
  useEffect(() => {
    // Only record sessions we actually heard well enough to score — logging a
    // low-confidence guess would corrupt streaks, scores and mastery.
    if (phase === "done" && feedback && feedback.reliable && userId && !loggedRef.current) {
      loggedRef.current = true;
      const missed = feedback.alignment.words
        .filter((w) => w.status === "wrong" || w.status === "missing")
        .slice(0, 40)
        .map((w) => ({ i: w.refIndex, h: w.heard }));
      // Which verses the attempt covered (for verse goals and per-verse mastery).
      const versesHit = new Set<number>();
      for (const w of feedback.alignment.words) {
        const v = flatWords[w.refIndex]?.ayah;
        if (v) versesHit.add(v);
      }
      const verseList = Array.from(versesHit);
      logSession(userId, {
        surah: surahNumber,
        score: feedback.score,
        correct: countStatus(feedback, "correct"),
        wrong: countStatus(feedback, "wrong"),
        missing: countStatus(feedback, "missing"),
        extra: feedback.alignment.extras.length,
        seconds: secondsRef.current,
        verses: verseList.length,
        from_verse: verseList.length ? Math.min(...verseList) : undefined,
        to_verse: verseList.length ? Math.max(...verseList) : undefined,
        peeks: peeksRef.current,
        hifz,
        hesitations: hesitationsRef.current.length,
        mistakes: missed,
      });
    }
  }, [phase, feedback, userId, surahNumber, flatWords, hifz]);

  // Live word-by-word following now runs in both engines (Fast directly, High
  // accuracy via a concurrent browser recogniser). Keep the live marks visible
  // through the short "processing" step in accurate mode until the final lands.
  const liveMode = phase === "recording";
  const showingLive = (phase === "recording" || phase === "processing") && !feedback;
  // A scored verdict is only shown when we heard clearly enough (confidence gate).
  const scored = !!feedback && feedback.reliable;

  // Live tally for the HUD while reciting.
  const liveCounts = useMemo(() => {
    const c = { correct: 0, missing: 0, wrong: 0 };
    for (const k in liveStatuses) {
      const st = liveStatuses[k];
      if (st === "correct" || st === "close") c.correct++;
      else if (st === "missing") c.missing++;
      else if (st === "wrong") c.wrong++;
    }
    return c;
  }, [liveStatuses]);

  // Memorisation peeking: open the next hidden word (or its whole verse) from
  // where the reciter is. Counted per attempt, so the summary can be honest
  // about how much help was used.
  const nextHidden = (): number | null => {
    if (hifz <= 0) return null;
    const from = phase === "recording" ? livePointer : 0;
    const visible = showingLive ? liveStatuses : scored ? statuses : undefined;
    for (let idx = from; idx < flatWords.length; idx++) {
      const st = visible?.[idx];
      if (st === "correct" || st === "close") continue;
      if (isMaskedSlot(idx, hifz) && !revealed.has(idx)) return idx;
    }
    return null;
  };
  const peekWord = () => {
    const idx = nextHidden();
    if (idx === null) return;
    peeksRef.current++;
    reveal(idx);
  };
  const peekVerse = () => {
    const idx = nextHidden();
    if (idx === null) return;
    peeksRef.current++;
    const verse = flatWords[idx].ayah;
    setRevealed((prev) => {
      const next = new Set(prev);
      flatWords.forEach((fw, i) => {
        if (fw.ayah === verse) next.add(i);
      });
      return next;
    });
  };

  // Memoise the surah so the (frequent) live-transcript text updates don't
  // re-invoke it — it only rebuilds when statuses / cursor / target actually change.
  const surahEl = useMemo(
    () => (
      <SurahView
        ayat={ayat}
        surahNumber={surahNumber}
        statuses={showingLive ? liveStatuses : scored ? statuses : undefined}
        maddVerdicts={scored ? maddVerdicts : undefined}
        activeIndex={liveMode ? livePointer : undefined}
        showTajweed={!showingLive && !scored}
        maskLevel={hifz}
        initialTopVerse={initialTopVerse}
        onTopVerseChange={handleTopVerseChange}
        revealed={revealed}
        onReveal={reveal}
        bookmarks
        showTranslation={settings.showTranslation}
        showTranslit={settings.showTranslit}
      />
    ),
    [
      revealed,
      reveal,
      settings.showTranslation,
      settings.showTranslit,
      ayat,
      surahNumber,
      showingLive,
      liveStatuses,
      statuses,
      maddVerdicts,
      liveMode,
      livePointer,
      scored,
      hifz,
      initialTopVerse,
      handleTopVerseChange,
    ],
  );

  if (phase === "unsupported") {
    return (
      <div>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200">
          Your browser doesn&apos;t support on-device recitation yet. Open Dugsi in{" "}
          <strong>Google Chrome</strong> (or Safari on iPhone) to use voice feedback — you can still
          read the surah and tajweed guide below.
        </div>
        <div className="mt-4">
          <SurahView ayat={ayat} surahNumber={surahNumber} showTajweed />
        </div>
      </div>
    );
  }

  const surahInfo = surahMeta(surahNumber);

  return (
    <div className="space-y-4">
      {/* Mushaf toolbar: what is open, and how the page is displayed */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {surahInfo?.transliteration ?? `Surah ${surahNumber}`}
            <span className="text-ink/40"> · </span>
            <span className="font-normal text-ink/60">
              {ayat.length === (surahInfo?.ayahCount ?? ayat.length)
                ? `${ayat.length} verses`
                : `verses ${ayat[0]?.number}–${ayat[ayat.length - 1]?.number}`}
            </span>
          </p>
          <EngineStatus
            modelStatus={modelStatus}
            modelPercent={modelPercent}
            model={modelInUse ?? (typeof window !== "undefined" ? pickWhisperModel(settings.quranModel) : null)}
            engineTick={engineTick}
            onReEnable={() => {
              reEnableWhisper();
              setEngineTick((t) => t + 1);
            }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Toggle
            on={settings.showTranslation}
            label="Translation"
            onClick={() => updateSettings({ showTranslation: !settings.showTranslation }, userId)}
          />
          <Toggle
            on={settings.showTranslit}
            label="Latin"
            onClick={() => updateSettings({ showTranslit: !settings.showTranslit }, userId)}
          />
        </div>
      </div>

      {error && (
        <div className="animate-in rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>
      )}

      {feedback && phase === "done" && (
        <ResultsPanel
          feedback={feedback}
          onReset={reset}
          mistakes={mistakes}
          surahNumber={surahNumber}
          recordingUrl={recording?.url}
          hesitations={hesitations.map((h) => ({
            ...h,
            word: flatWords[h.beforeRefIndex]?.word.uthmani ?? "",
            verse: flatWords[h.beforeRefIndex]?.ayah ?? 0,
          }))}
        />
      )}

      {/* The mushaf page */}
      {surahEl}

      {/* Control dock — pinned above the tab bar while the page scrolls */}
      <div className="sticky bottom-[4.4rem] z-30">
        <div className="rounded-2xl border border-white/10 bg-shell/85 p-3 shadow-soft backdrop-blur-md">
          {phase === "recording" && (
            <div className="mb-2 px-1 text-center">
              <p className="ayah truncate text-xl text-ink/80" dir="rtl">
                {liveText || "…"}
              </p>
              <LiveTally
                correct={liveCounts.correct}
                missing={liveCounts.missing}
                wrong={liveCounts.wrong}
                extra={liveExtras}
                detecting={settings.liveMistakes}
              />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {/* Memorise */}
            <HifzToggle level={hifz} onSelect={setHifz} onPeekWord={peekWord} onPeekVerse={peekVerse} />

            {/* Mic */}
            {phase === "recording" ? (
              <button onClick={stop} className="relative grid h-16 w-16 shrink-0 place-items-center" aria-label="Stop reciting">
                <span className="absolute inset-0 animate-ring rounded-full bg-red-500/40" />
                <span className="absolute inset-0 rounded-full bg-red-500/15" />
                <span className="relative grid h-14 w-14 place-items-center rounded-full bg-red-600 text-white shadow-soft transition active:scale-95">
                  <span className="h-5 w-5 rounded-md bg-white" />
                </span>
              </button>
            ) : (
              <button
                onClick={start}
                disabled={phase === "processing"}
                className="group relative grid h-16 w-16 shrink-0 place-items-center disabled:opacity-60"
                aria-label="Start reciting"
              >
                <span className="absolute inset-0 rounded-full bg-emerald/15 transition group-hover:bg-emerald/25" />
                <span className="relative grid h-14 w-14 place-items-center rounded-full bg-gradient-to-b from-emerald-bright to-emerald text-shell shadow-soft ring-4 ring-emerald/20 transition group-active:scale-95">
                  {phase === "processing" ? (
                    <span className="h-7 w-7 animate-spin rounded-full border-2 border-shell/40 border-t-shell" />
                  ) : (
                    <MicIcon className="h-8 w-8" />
                  )}
                </span>
              </button>
            )}

            {/* Status */}
            <div className="min-w-0 flex-1 text-right text-xs text-ink/60">
              {phase === "recording" ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-red-400">
                  <span className="rec-dot h-2 w-2 rounded-full bg-red-500" />
                  {formatTime(seconds)}
                </span>
              ) : phase === "processing" ? (
                <span>{progress ?? "Working…"}</span>
              ) : phase === "done" || phase === "error" ? (
                <span>Tap the mic to recite again</span>
              ) : (
                <span>Tap the mic and recite aloud</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition ${
        on ? "bg-emerald/20 text-emerald-bright ring-emerald/40" : "text-ink/50 ring-white/15 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

/** No modes to choose any more — the best available engine is picked
 *  automatically. This line just tells the reciter what their device does. */
function EngineStatus({
  modelStatus,
  modelPercent,
  model,
  engineTick,
  onReEnable,
}: {
  modelStatus: ModelStatus;
  modelPercent: number;
  model: WhisperModel | null;
  engineTick: number;
  onReEnable: () => void;
}) {
  // engineTick is read so the line re-evaluates after a manual re-enable.
  void engineTick;
  const capable = typeof window !== "undefined" && whisperCapable();
  const disabled = typeof window !== "undefined" && whisperDisabledByCrashes();
  return (
    <p className="truncate text-[11px] text-ink/45">
      {modelStatus === "loading" ? (
        `Preparing the precise on device check… ${modelPercent}%`
      ) : capable ? (
        model?.id === "quran"
          ? "Live word marking (via your browser), plus a precise Quran-tuned check that runs on your device."
          : "Live word marking (via your browser), plus a precise check that runs on your device."
      ) : disabled ? (
        <>
          Live word marking via your browser. The on device check is off after a crash here.{" "}
          <button onClick={onReEnable} className="font-semibold text-emerald-bright underline underline-offset-2">
            Try it again
          </button>
        </>
      ) : (
        "Live word marking via your browser. Free, and your recording stays on your device."
      )}
    </p>
  );
}

/** The running tally shown under the live transcript while reciting. */
function LiveTally({
  correct,
  missing,
  wrong,
  extra,
  detecting,
}: {
  correct: number;
  missing: number;
  wrong: number;
  extra: number;
  detecting: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
      <span className="font-semibold text-emerald-bright">✓ {correct}</span>
      {detecting ? (
        <>
          <span className={wrong > 0 ? "font-semibold text-red-400" : "text-ink/40"}>✗ {wrong} wrong</span>
          <span className={missing > 0 ? "font-semibold text-amber-300" : "text-ink/40"}>↷ {missing} skipped</span>
          <span className={extra > 0 ? "font-semibold text-amber-300" : "text-ink/40"}>+ {extra} added</span>
        </>
      ) : (
        <span className="text-ink/40">Recite at your own pace.</span>
      )}
    </div>
  );
}

function HifzToggle({
  level,
  onSelect,
  onPeekWord,
  onPeekVerse,
}: {
  level: number;
  onSelect: (l: number) => void;
  onPeekWord: () => void;
  onPeekVerse: () => void;
}) {
  const labels = ["Off", "Easy", "Medium", "Hard"];
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
      <button
        onClick={() => onSelect((level + 1) % 4)}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
          level > 0 ? "bg-gold/20 text-gold-soft ring-gold/40" : "text-ink/60 ring-white/15 hover:text-ink"
        }`}
        title="Memorisation: hide words and reveal them as you recite"
      >
        Memorise · {labels[level]}
      </button>
      {level > 0 && (
        <div className="flex items-center gap-1">
          <button onClick={onPeekWord} className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-gold-soft ring-1 ring-gold/30 hover:bg-gold/10">
            👁 word
          </button>
          <button onClick={onPeekVerse} className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-gold-soft ring-1 ring-gold/30 hover:bg-gold/10">
            👁 verse
          </button>
        </div>
      )}
    </div>
  );
}

function ResultsPanel({
  feedback,
  onReset,
  mistakes,
  surahNumber,
  recordingUrl,
  hesitations,
}: {
  feedback: RecitationFeedback;
  onReset: () => void;
  mistakes: Mistake[];
  surahNumber: number;
  recordingUrl?: string;
  hesitations: (Hesitation & { word: string; verse: number })[];
}) {
  const rushed = feedback.timing.checks.filter((c) => c.verdict === "rushed");

  // Confidence gate: if we could not hear clearly, never show a score or red
  // marks — that would tell a correct reciter she failed. Show an honest state.
  if (!feedback.reliable) {
    return (
      <div className="animate-in rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6 shadow-soft">
        <h2 className="text-lg font-bold text-ink">We could not hear you clearly enough</h2>
        <p className="mt-2 text-sm text-ink/70">
          To avoid marking your recitation wrong by mistake, we are not scoring this attempt. Try
          again a little closer to the microphone, in a quieter place, and recite at a steady pace.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={onReset}
            className="rounded-lg bg-gradient-to-b from-emerald to-emerald-deep px-4 py-2 text-sm font-semibold text-white shadow-soft"
          >
            Try again
          </button>
          <HearYourselfButton recordingUrl={recordingUrl} />
        </div>
        <details className="mt-4 text-xs text-ink/40">
          <summary className="cursor-pointer">What we heard</summary>
          <p className="ayah mt-1 text-lg" dir="rtl">
            {feedback.transcript || "—"}
          </p>
        </details>
      </div>
    );
  }

  return (
    <div className="animate-in rounded-2xl border border-emerald/25 bg-surface/90 p-6 shadow-soft">
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
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-ink/80 transition hover:bg-white/5"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Correct words" value={countStatus(feedback, "correct")} tone="good" />
        <Stat label="Needs work" value={countStatus(feedback, "wrong")} tone="bad" />
        <Stat label="Skipped" value={countStatus(feedback, "missing")} tone="warn" />
        <Stat label="Added words" value={feedback.alignment.extras.length} tone="warn" />
      </div>

      {feedback.alignment.extras.length > 0 && (
        <p className="mt-2 text-xs text-ink/50">
          Words heard that are not in the text:{" "}
          <span className="font-arabic text-sm text-ink/70" dir="rtl">
            {feedback.alignment.extras.slice(0, 12).join(" · ")}
          </span>
        </p>
      )}

      {rushed.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">
          <strong>Tajweed tip:</strong> {rushed.length} elongation{rushed.length > 1 ? "s" : ""}{" "}
          looked rushed (marked ⏱ below). Hold the madd letters longer — especially the 6-count madd
          in <span className="font-arabic">ٱلضَّآلِّينَ</span>.
          <span className="block text-xs text-amber-200/80">
            Timing estimate from word-level timestamps — treat it as a hint.
          </span>
        </div>
      )}

      {hesitations.length > 0 && (
        <div className="mt-4 rounded-xl border border-white/10 bg-surface/90 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">
            Hesitations ({hesitations.length})
          </p>
          <p className="mt-1 text-xs text-ink/55">
            You paused for a while before these words — the places memory is still thin.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {hesitations.slice(0, 12).map((h, i) => (
              <li key={i} className="rounded-lg bg-surface-2 px-2.5 py-1 ring-1 ring-white/5">
                <span className="ayah text-lg" dir="rtl">
                  {h.word}
                </span>
                <span className="ml-2 text-xs text-ink/45">
                  verse {h.verse} · {h.seconds.toFixed(1)} s
                </span>
              </li>
            ))}
          </ul>
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
          Recognised free ({feedback.engine}). Recognition can misread classical Arabic — if a word
          is marked wrong but you said it right, it may be the recogniser, not you.
        </p>
      </details>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? "#4fd8a8" : score >= 60 ? "#fbbf24" : "#f87171";
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#2a3530" strokeWidth="6" />
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
  const color = tone === "good" ? "#4fd8a8" : tone === "bad" ? "#f87171" : "#fbbf24";
  return (
    <div className="rounded-xl border border-white/10 bg-surface-2 p-3 text-center sm:text-left">
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
