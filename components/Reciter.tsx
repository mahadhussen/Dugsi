"use client";

// Recite: the reciter reads aloud, Dugsi follows word by word and judges.
//
// This file is the flow (when and why). How the listening works lives in
// lib/listen/recite-engine.ts; what is true about each word lives in the pure
// follower (lib/follow). Live marks come from the follower as pieces are
// decoded; the verdict is ready the moment the last piece is, with no second
// pass over the recording.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SurahView, { isMaskedSlot } from "./SurahView";
import { isSpeechSupported } from "@/lib/speech/recognizer";
import type { WordStatus } from "@/lib/align";
import type { ViewStatus } from "./WordSpan";
import { type Ayah, flattenAyat } from "@/lib/quran/types";
import { useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadFurthest, saveFurthest, logSession } from "@/lib/supabase/progress";
import { clipForMistake } from "@/lib/review";
import { saveRecording } from "@/lib/recordings";
import {
  checkForPriorCrash,
  whisperDisabledByCrashes,
  markWhisperRunning,
  markWhisperFinished,
  clearCrashBreadcrumb,
  reEnableWhisper,
} from "@/lib/crashGuard";
import { buildRef } from "@/lib/follow/text";
import { normalizeWord } from "@/lib/arabic";
import { applyPiece, createFollower, liveCursor } from "@/lib/follow/follower";
import { liveMarks, verdictOf, type Verdict } from "@/lib/follow/verdict";
import { ReciteEngine, type EngineSnapshot, type Hesitation } from "@/lib/listen/recite-engine";
import { asr } from "@/lib/listen/asr";
import { ASR_MODEL } from "@/lib/listen/model";
import { pause as pauseListening } from "@/lib/listen-engine";
import { stopVerse } from "@/lib/verse-player";
import MistakeReview, { HearYourselfButton, type Mistake } from "./MistakeReview";

type Phase = "idle" | "recording" | "processing" | "done" | "error" | "unsupported";

const AUTO_STOP_MS = 6000;

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" fill="currentColor" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Reciter({
  ayat,
  surahNumber,
  trackProgress = false,
  startVerse,
  wordOffset = 0,
}: {
  ayat: Ayah[];
  surahNumber: number;
  trackProgress?: boolean;
  /** Scroll to this 1-based verse first (e.g. a bookmark or a mistake to practise). */
  startVerse?: number;
  /** Index in the whole surah of the first word shown (a practice range starts
   *  mid-surah). Everything saved is keyed on the whole surah, so history,
   *  weak spots and recordings stay right whichever range was practised. */
  wordOffset?: number;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const settings = useSettings();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Verdict | null>(null);
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [hesitations, setHesitations] = useState<Hesitation[]>([]);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [hifz, setHifz] = useState(0); // 0 = off, 1 some, 2 most, 3 all
  const [engineTick, setEngineTick] = useState(0);
  const engineRef = useRef<ReciteEngine | null>(null);
  const loggedRef = useRef(false);
  const secondsRef = useRef(0);
  /** The take saved for this recitation, linked from its session. */
  const takeRef = useRef<number | null>(null);
  const topVerseRef = useRef(0); // the verse at the top of the screen, where reciting starts
  /** Drop an attempt in flight; it is not a crash, so its breadcrumb goes too. */
  const cancelEngine = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.cancel();
      markWhisperFinished();
    }
  }, []);

  // Memorisation: hidden words the reader opened (tap or Peek), and how often.
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

  const flatWords = useMemo(() => flattenAyat(ayat), [ayat]);
  const ref = useMemo(() => buildRef(ayat), [ayat]);
  const textWords = useMemo(() => flatWords.map((f) => f.word), [flatWords]);

  const clearRecording = useCallback(() => {
    setRecordingUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    checkForPriorCrash(); // a past model run that killed the page is counted
    const canListen = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    if (!canListen && !isSpeechSupported()) setPhase("unsupported");
    // A deliberate close or backgrounding is not a crash.
    const onLeave = () => clearCrashBreadcrumb();
    const onHide = () => document.visibilityState === "hidden" && clearCrashBreadcrumb();
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onHide);
      cancelEngine();
    };
  }, [cancelEngine]);

  // Start fetching the model as soon as reciting is on screen, so the first
  // verse is judged by it rather than waiting for a 67 MB download.
  // iPhone without WebGPU runs the model on the CPU in a tab with a tight memory
  // limit — the old model memory-killed it there — so it stays with the browser.
  // iPhone with WebGPU runs it, but every browser there shares one tight
  // memory limit per tab and reloads the page when it is passed: the model is
  // loaded only when the mic is tapped and let go when reciting closes
  // (another surah, Listen, another page), never left resident.
  const [iosNoGpu, setIosNoGpu] = useState(false);
  const [iosLean, setIosLean] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || "";
    const ios = /iP(hone|ad|od)/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    setIosNoGpu(ios && !("gpu" in navigator));
    setIosLean(ios && "gpu" in navigator);
    if (!ios) return;
    return () => {
      asr.unload();
      markWhisperFinished();
    };
  }, []);
  const modelAllowed = settings.quranModel && !whisperDisabledByCrashes() && !iosNoGpu;
  useEffect(() => {
    // On a "save data" connection, wait until the mic is actually tapped.
    const saveData = (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;
    if (modelAllowed && !iosLean && !saveData && asr.status === "idle") {
      // Loading the model is where a phone runs out of memory, if anywhere:
      // leave a breadcrumb so a killed tab is counted (see crashGuard).
      markWhisperRunning();
      void asr.load().then(() => {
        if (!engineRef.current) markWhisperFinished();
      });
    }
  }, [modelAllowed, iosLean, engineTick]);
  const [model, setModel] = useState({ status: asr.status, percent: asr.percent, device: asr.device });
  useEffect(() => asr.subscribe(() => setModel({ status: asr.status, percent: asr.percent, device: asr.device })), []);

  // A new surah or range: drop any attempt in flight and its result.
  useEffect(() => {
    cancelEngine();
    engineRef.current = null;
    setFeedback(null);
    setSnap(null);
    setError(null);
    setHesitations([]);
    clearRecording();
    setPhase((p) => (p === "unsupported" ? p : "idle"));
  }, [ayat, clearRecording, cancelEngine]);

  const stop = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setPhase("processing");
    setProgress("Checking the last verse…");
    const result = await engine.stop((waiting) =>
      setProgress(waiting > 1 ? `Checking the last ${waiting} pieces…` : "Checking the last verse…"),
    );
    markWhisperFinished();
    setProgress(null);
    if (engineRef.current !== engine || !result) return;
    secondsRef.current = Math.round(result.seconds);
    setHesitations(result.hesitations);
    if (result.recording && result.recording.size > 0) {
      setRecordingUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(result.recording!);
      });
      // Clip times keyed on the whole surah (the history review uses those).
      const clips: Record<number, { start: number; end: number }> = {};
      for (const k in result.verdict.clips) clips[Number(k) + wordOffset] = result.verdict.clips[k];
      const at = Date.now();
      takeRef.current = at;
      void saveRecording(surahNumber, result.recording, clips, at);
    }
    const heardSomething = result.verdict.alignment.words.length > 0 || result.verdict.transcript.trim().length > 0;
    if (!heardSomething) {
      setError(
        result.modelPending
          ? `The Quran listening model is still downloading (${asr.percent}%). Please recite again in a moment — it only downloads once.`
          : "We couldn't hear any recitation. Please try again a little closer to the microphone.",
      );
      setPhase("error");
      return;
    }
    setFeedback(result.verdict);
    setPhase("done");
  }, [surahNumber, wordOffset]);
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const start = async () => {
    // The Sheikh must not be playing into the microphone: the model would hear
    // him, not the reciter.
    pauseListening();
    stopVerse();
    cancelEngine();
    setError(null);
    setFeedback(null);
    setHesitations([]);
    setRevealed(new Set());
    peeksRef.current = 0;
    loggedRef.current = false;
    takeRef.current = null;
    litSteps.current.clear();
    clearRecording();
    const range = { start: 0, end: ref.norm.length };
    // Start following where the reader is: a bookmark, a mistake to practise,
    // or the verse at the top of the screen.
    const fromVerse = startVerse && startVerse > 1 ? startVerse : topVerseRef.current > 1 ? topVerseRef.current : 0;
    const engine = new ReciteEngine({
      ref,
      range,
      from: fromVerse ? ref.verseFirst.get(fromVerse) : undefined,
      words: textWords,
      useModel: modelAllowed,
      autoStopMs: settings.autoStop ? AUTO_STOP_MS : null,
      onUpdate: (s) => {
        if (engineRef.current === engine) setSnap(s);
      },
      onAutoStop: () => void stopRef.current(),
    });
    engineRef.current = engine;
    // Dev-only handle for inspecting a live attempt from the console.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __dugsiEngine?: ReciteEngine }).__dugsiEngine = engine;
    if (modelAllowed) markWhisperRunning();
    setPhase("recording");
    const ok = await engine.start();
    const why = engine.snapshot().error;
    if (!ok && engineRef.current === engine && why) {
      markWhisperFinished();
      setError(
        why === "mic-denied"
          ? "Microphone access was denied. Please allow the mic and try again."
          : "The microphone could not be started in this browser. Try reloading the page, or another browser.",
      );
      setPhase("error");
    }
  };

  // Resume point (from the account or this device).
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
      topVerseRef.current = verse;
      if (trackProgress) saveFurthest(userId, surahNumber, verse);
    },
    [trackProgress, userId, surahNumber],
  );

  // Live picture while reciting.
  const recording = phase === "recording";
  const follow = snap?.follow ?? null;
  const livePointer = follow ? liveCursor(follow) : 0;
  // Words the reader has passed but no piece has judged yet glow green while
  // they read — each one a step after the one before, so the green flows
  // with the voice instead of jumping. Once judged they settle: green, or
  // yellow / grey. A word keeps the step it was first lit with.
  const litSteps = useRef(new Map<number, number>());
  const liveStatuses = useMemo<Record<number, ViewStatus>>(() => {
    if (!follow) return {};
    const marks = liveMarks(follow);
    const out: Record<number, ViewStatus> = {};
    for (const k in marks) {
      if (settings.liveMistakes || marks[k] === "correct" || marks[k] === "close") out[k] = marks[k];
    }
    const lit = litSteps.current;
    let fresh = 0;
    for (let k = follow.cursor; k < livePointer; k++) {
      if (out[k] || marks[k]) continue;
      if (!lit.has(k)) lit.set(k, Math.min(7, fresh++));
      out[k] = `reading${lit.get(k)!}` as ViewStatus;
    }
    return out;
  }, [follow, livePointer, settings.liveMistakes]);

  // Reading position follows the reciter on long surahs.
  useEffect(() => {
    if (!recording || !trackProgress || !follow) return;
    const verse = flatWords[Math.min(flatWords.length - 1, follow.cursor)]?.ayah;
    if (verse) saveFurthest(userId, surahNumber, verse);
  }, [recording, trackProgress, follow, flatWords, userId, surahNumber]);

  // QA: `?demo=result` renders a result from a canned recitation (a skipped
  // word every 7th, a wrong one every 11th, one letter dropped every 13th)
  // through the real follower.
  useEffect(() => {
    if (typeof window === "undefined" || phase !== "idle") return;
    if (new URLSearchParams(window.location.search).get("demo") !== "result") return;
    let s = createFollower(ref);
    ayat.forEach((a, vi) => {
      const slip = (w: string) => {
        const n = normalizeWord(w);
        return n.length > 3 ? n.slice(0, 1) + n.slice(2) : w;
      };
      const words = a.words
        .map((w) => w.uthmani)
        .filter((_, i) => (vi * 3 + i) % 7 !== 3)
        .map((w, i) => ((vi + i) % 11 === 5 ? "كتاب" : (vi + i) % 13 === 8 ? slip(w) : w));
      s = applyPiece(s, { id: vi, t0: vi * 4, t1: vi * 4 + 3.5, text: words.join(" "), source: "browser" });
    });
    setFeedback(verdictOf(s, { words: textWords, engine: "demo" }));
    setPhase("done");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayat]);

  const reset = () => {
    setFeedback(null);
    setError(null);
    clearRecording();
    setPhase("idle");
  };

  const scored = !!feedback && feedback.reliable;
  const statuses = useMemo<Record<number, WordStatus> | undefined>(
    () => (feedback ? Object.fromEntries(feedback.alignment.words.map((w) => [w.refIndex, w.status])) : undefined),
    [feedback],
  );
  const maddVerdicts = useMemo(
    () => (feedback ? Object.fromEntries(feedback.timing.checks.map((c) => [c.refIndex, c.verdict])) : undefined),
    [feedback],
  );

  // Per-mistake review: "You" replays the reciter's own word from the recording
  // (precise model times), "Correct" plays the qari.
  const mistakes = useMemo<Mistake[]>(() => {
    if (!feedback) return [];
    return feedback.mistakes
      .filter((m) => m.kind === "wrong" || m.kind === "skipped")
      .slice(0, 30)
      .map((m) => {
        const fw = flatWords[m.refIndex];
        const skipped = m.kind === "skipped";
        return {
          refIndex: m.refIndex,
          uthmani: fw?.word.uthmani ?? "",
          translit: fw?.word.translit,
          heard: m.heard,
          verse: fw?.ayah ?? 1,
          indexInAyah: fw?.indexInAyah,
          skipped,
          time: clipForMistake(feedback.clips, m.refIndex, skipped),
        };
      });
  }, [feedback, flatWords]);

  // One saved session per finished, trustworthy recitation — for everyone.
  // (It used to need an account, so signed-out readers kept no history.)
  useEffect(() => {
    if (phase !== "done" || !feedback || !feedback.reliable || loggedRef.current) return;
    if (feedback.engine === "demo") return;
    loggedRef.current = true;
    const missed = feedback.mistakes
      .filter((m) => m.kind === "wrong" || m.kind === "skipped")
      .slice(0, 40)
      .map((m) => ({ i: m.refIndex + wordOffset, h: m.heard, t: m.kind === "wrong" ? ("w" as const) : ("s" as const) }));
    // Verses actually heard and judged: a verse we could not hear is not one
    // the reader recited cleanly, so it must not count as practice of it.
    const heardWords = new Map<number, { judged: number; total: number }>();
    for (const w of feedback.alignment.words) {
      const v = flatWords[w.refIndex]?.ayah;
      if (!v) continue;
      const e = heardWords.get(v) ?? { judged: 0, total: 0 };
      e.total++;
      if (w.status !== "unclear") e.judged++;
      heardWords.set(v, e);
    }
    const verseList = Array.from(heardWords.entries())
      .filter(([, e]) => e.judged === e.total)
      .map(([v]) => v)
      .sort((a, b) => a - b);
    const count = (st: WordStatus) => feedback.alignment.words.filter((w) => w.status === st).length;
    logSession(userId, {
      surah: surahNumber,
      score: feedback.score,
      correct: count("correct"),
      wrong: count("wrong"),
      missing: count("missing"),
      extra: feedback.extras.length,
      seconds: secondsRef.current,
      verses: verseList.length,
      from_verse: verseList.length ? Math.min(...verseList) : undefined,
      to_verse: verseList.length ? Math.max(...verseList) : undefined,
      peeks: peeksRef.current,
      hifz,
      hesitations: hesitations.length,
      mistakes: missed,
      hv: verseList,
      take: takeRef.current ?? undefined,
    });
  }, [phase, feedback, userId, surahNumber, flatWords, hifz, hesitations, wordOffset]);

  const showingLive = (phase === "recording" || phase === "processing") && !feedback;

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

  // Memorisation peeking from where the reciter is.
  const nextHidden = (): number | null => {
    if (hifz <= 0) return null;
    const from = recording ? livePointer : 0;
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

  const surahEl = useMemo(
    () => (
      <SurahView
        ayat={ayat}
        surahNumber={surahNumber}
        statuses={showingLive ? liveStatuses : scored ? statuses : undefined}
        maddVerdicts={scored ? maddVerdicts : undefined}
        activeIndex={recording ? livePointer : undefined}
        showTajweed={!showingLive && !scored && settings.showTajweed}
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
      settings.showTajweed,
      ayat,
      surahNumber,
      showingLive,
      liveStatuses,
      statuses,
      maddVerdicts,
      recording,
      livePointer,
      scored,
      hifz,
      initialTopVerse,
      handleTopVerseChange,
    ],
  );

  // Results appear above the page: bring them into view when they land.
  const resultsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (phase === "done" && feedback) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phase, feedback]);

  if (phase === "unsupported") {
    return (
      <div>
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/15 p-4 text-sm text-amber-700">
          Your browser can&apos;t use the microphone here. Open Dugsi in <strong>Chrome</strong> or <strong>Safari</strong>{" "}
          to recite — you can still read the surah below.
        </div>
        <div className="mt-4">
          <SurahView ayat={ayat} surahNumber={surahNumber} showTajweed />
        </div>
      </div>
    );
  }

  const seconds = Math.floor(snap?.seconds ?? 0);

  return (
    <div className="space-y-4">
      {error && <div className="animate-in rounded-2xl border-2 border-red-500/30 bg-red-500/10 p-4 text-base font-semibold text-red-700">{error}</div>}

      {feedback && phase === "done" && (
        <div ref={resultsRef} className="scroll-mt-20">
          <ResultsPanel
            feedback={feedback}
            onReset={reset}
            mistakes={mistakes}
            surahNumber={surahNumber}
            recordingUrl={recordingUrl ?? undefined}
            hesitations={hesitations.map((h) => ({
              ...h,
              word: flatWords[h.beforeRefIndex]?.word.uthmani ?? "",
              verse: flatWords[h.beforeRefIndex]?.ayah ?? 0,
            }))}
          />
        </div>
      )}

      {/* The mushaf page */}
      {surahEl}

      {/* Control dock — pinned above the tab bar while the page scrolls */}
      <div className="sticky bottom-[5.6rem] z-30">
        <div className="card p-3">
          {recording && (
            <div className="mb-2 px-1 text-center">
              <p className="ayah truncate text-2xl text-ink/80" dir="rtl">
                {snap?.heard || "…"}
              </p>
              <LiveTally correct={liveCounts.correct} missing={liveCounts.missing} wrong={liveCounts.wrong} extra={snap?.extras ?? 0} detecting={settings.liveMistakes} />
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <HifzToggle level={hifz} onSelect={setHifz} onPeekWord={peekWord} onPeekVerse={peekVerse} />

            {recording ? (
              <button onClick={() => void stop()} className="relative grid h-20 w-20 shrink-0 place-items-center" aria-label="Stop reciting">
                <VoiceRing engineRef={engineRef} />
                <span className="absolute inset-0 rounded-full bg-red-500/15" />
                <span className="relative grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-red-600 text-white shadow-soft transition active:scale-95">
                  <span className="h-7 w-7 rounded-md bg-white" />
                </span>
              </button>
            ) : (
              <button
                onClick={() => void start()}
                disabled={phase === "processing"}
                className="group relative grid h-20 w-20 shrink-0 place-items-center disabled:opacity-60"
                aria-label="Start reciting"
              >
                <span className="absolute inset-0 rounded-full bg-emerald/15 transition group-hover:bg-emerald/25" />
                <span className="relative grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-emerald text-white shadow-soft transition group-active:scale-95">
                  {phase === "processing" ? (
                    <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/40 border-t-white" />
                  ) : (
                    <MicIcon className="h-10 w-10" />
                  )}
                </span>
              </button>
            )}

            <div className="min-w-0 flex-1 text-right text-sm font-bold text-ink/70">
              {recording ? (
                <span className="inline-flex items-center gap-1.5 text-red-600">
                  <span className="rec-dot h-2.5 w-2.5 rounded-full bg-red-500" />
                  {formatTime(seconds)}
                </span>
              ) : phase === "processing" ? (
                <span>{progress ?? "Checking…"}</span>
              ) : phase === "done" || phase === "error" ? (
                <span>Tap the mic to recite again</span>
              ) : (
                <span>Tap the mic, then recite aloud</span>
              )}
            </div>
          </div>
          <EngineStatus
            model={model}
            allowed={modelAllowed}
            noGpu={iosNoGpu && settings.quranModel}
            disabledByCrash={whisperDisabledByCrashes()}
            onReEnable={() => {
              reEnableWhisper();
              setEngineTick((t) => t + 1);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** What is listening, in one honest line. */
function EngineStatus({
  model,
  allowed,
  noGpu,
  disabledByCrash,
  onReEnable,
}: {
  model: { status: string; percent: number; device: string | null };
  allowed: boolean;
  /** An iPhone whose Safari has no WebGPU: the model is not run there. */
  noGpu: boolean;
  disabledByCrash: boolean;
  onReEnable: () => void;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!hydrated) return <p className="mt-2 h-4" />;
  let text: React.ReactNode;
  if (disabledByCrash) {
    text = (
      <>
        Listening via your browser — the Quran model is off after a crash on this device.{" "}
        <button onClick={onReEnable} className="font-semibold text-emerald-bright underline underline-offset-2">
          Try it again
        </button>
      </>
    );
  } else if (noGpu) {
    text = "This iPhone's browser can't run the Quran model yet (it needs WebGPU, in iOS 26 and later), so its speech service listens instead and may send audio to Apple.";
  } else if (!allowed) {
    text = "Listening via your browser's speech service (the Quran model is off in Options; in Chrome the service sends audio to Google).";
  } else if (model.status === "ready") {
    text = `Listening with Tarteel's Quran model on your device${model.device === "webgpu" ? " (graphics chip)" : ""} — your voice stays here.`;
  } else if (model.status === "loading") {
    text = `Getting the Quran listening model ready… ${model.percent}% (about ${ASR_MODEL.approxMb} MB, only once). Until then your browser's speech service listens — in Chrome it sends audio to Google.`;
  } else if (model.status === "failed") {
    text = "The Quran model could not load here, so your browser's speech service listens instead (in Chrome it sends audio to Google).";
  } else {
    text = "Tap the mic to start.";
  }
  return <p className="mt-2 text-center text-xs font-semibold text-ink/45">{text}</p>;
}

/** A ring round the mic that swells with the reciter's voice: seen at once
 *  that the voice is heard (and that the microphone is not picking up
 *  anything, when it stays still). Read every frame, outside React state. */
function VoiceRing({ engineRef }: { engineRef: React.MutableRefObject<ReciteEngine | null> }) {
  const el = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const level = engineRef.current?.level ?? 0;
      if (el.current) {
        el.current.style.transform = `scale(${1 + level * 0.45})`;
        el.current.style.opacity = String(0.25 + level * 0.6);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [engineRef]);
  return <span ref={el} className="absolute inset-0 rounded-full bg-red-500/50 transition-transform duration-75" aria-hidden />;
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
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-bold">
      <span className="text-emerald-bright">✓ {correct}</span>
      {detecting ? (
        <>
          <span className={wrong > 0 ? "font-semibold text-amber-600" : "text-ink/40"}>✗ {wrong} wrong</span>
          <span className={missing > 0 ? "font-semibold text-ink/60" : "text-ink/40"}>↷ {missing} skipped</span>
          <span className={extra > 0 ? "font-semibold text-amber-600" : "text-ink/40"}>+ {extra} added</span>
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
  const labels = ["Off", "Some", "Most", "All"];
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
      <button
        onClick={() => onSelect((level + 1) % 4)}
        className={`rounded-xl border-2 px-3 py-2 text-sm font-extrabold transition ${
          level > 0 ? "border-gold bg-gold/15 text-gold-soft" : "border-ink/15 text-ink/70 hover:border-ink/30"
        }`}
        title="Memorise: hide words and reveal them as you recite"
      >
        Hide words · {labels[level]}
      </button>
      {level > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={onPeekWord} className="whitespace-nowrap rounded-lg border-2 border-gold/40 px-2 py-1 text-xs font-bold text-gold-soft hover:bg-gold/10">
            Show word
          </button>
          <button onClick={onPeekVerse} className="whitespace-nowrap rounded-lg border-2 border-gold/40 px-2 py-1 text-xs font-bold text-gold-soft hover:bg-gold/10">
            Show verse
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
  feedback: Verdict;
  onReset: () => void;
  mistakes: Mistake[];
  surahNumber: number;
  recordingUrl?: string;
  hesitations: (Hesitation & { word: string; verse: number })[];
}) {
  const rushed = feedback.timing.checks.filter((c) => c.verdict === "rushed");
  const count = (st: WordStatus) => feedback.alignment.words.filter((w) => w.status === st).length;

  // Confidence gate: if we could not hear clearly, never show a score or red
  // marks — that would tell a correct reciter she failed. Show an honest state.
  if (!feedback.reliable) {
    return (
      <div className="animate-in rounded-3xl border-2 border-amber-400/40 bg-amber-400/15 p-5 shadow-soft">
        <h2 className="text-2xl font-extrabold text-ink">We could not hear you clearly</h2>
        <p className="mt-2 text-base font-semibold text-ink/70">
          To avoid marking your recitation wrong by mistake, we are not scoring this attempt. Try again a little closer to
          the microphone, in a quieter place, and recite at a steady pace.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={onReset} className="btn-primary">
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
    <div className="animate-in card p-5">
      <div className="flex items-center gap-4">
        <ScoreRing score={feedback.score} />
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-ink">Your recitation</h2>
          <p className="text-base font-semibold text-ink/70">{feedback.summary}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={onReset} className="btn-primary">
          Try again
        </button>
        <HearYourselfButton recordingUrl={recordingUrl} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat
          label="Correct words"
          value={count("correct")}
          tone="good"
          note={count("close") > 0 ? `+ ${count("close")} nearly right` : undefined}
        />
        <Stat label="Needs work" value={count("wrong")} tone="warn" />
        <Stat label="Skipped" value={count("missing")} tone="muted" />
        <Stat label="Not heard" value={feedback.unclear} tone="muted" />
      </div>

      {feedback.unclear > 0 && (
        <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm font-semibold text-ink/60">
          The faded words on the page are ones we could not hear clearly — noise, a quiet stretch, or the model missing
          them. They are not counted against you. Recite them again if you like.
        </p>
      )}

      {feedback.extras.length > 0 && (
        <p className="mt-2 text-sm font-semibold text-ink/50">
          Words heard that are not in the text:{" "}
          <span className="font-arabic text-sm text-ink/70" dir="rtl">
            {feedback.extras.slice(0, 12).join(" · ")}
          </span>
        </p>
      )}

      {rushed.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-400/15 p-3 text-base font-semibold text-amber-800">
          <strong>Tajweed tip:</strong> {rushed.length} long madd{rushed.length > 1 ? "s" : ""} looked much too short
          (marked ⏱). The six-count madd, as in <span className="font-arabic">ٱلضَّآلِّينَ</span>, is held long.
          <span className="block text-xs text-amber-700/80">A timing estimate from word timestamps — treat it as a hint.</span>
        </div>
      )}

      {hesitations.length > 0 && (
        <div className="mt-4 rounded-xl border-2 border-ink/10 bg-surface p-3 text-sm">
          <p className="text-xs font-extrabold uppercase tracking-wide text-ink/50">Hesitations ({hesitations.length})</p>
          <p className="mt-1 text-sm font-semibold text-ink/55">
            You paused for a while before these words — the places memory is still thin.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {hesitations.slice(0, 12).map((h, i) => (
              <li key={i} className="rounded-lg bg-surface-2 px-2.5 py-1 ring-1 ring-ink/5">
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

      <details className="mt-4 text-base">
        <summary className="cursor-pointer font-bold text-ink/55 transition hover:text-ink/80">What we heard (transcript)</summary>
        <p className="ayah mt-2 text-xl" dir="rtl">
          {feedback.transcript}
        </p>
        <p className="mt-1 text-xs text-ink/40">
          Heard by {feedback.engine}. Dugsi checks the words, not the vowel marks. Recognition can still slip — if a word
          is marked wrong but you said it right, it may be the recogniser, not you. Tap “You” to hear yourself.
        </p>
      </details>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 85 ? "var(--good)" : score >= 60 ? "var(--warn)" : "var(--bad)";
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--track)" strokeWidth="6" />
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
      <span className="absolute inset-0 grid place-items-center text-3xl font-extrabold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: number;
  tone: "good" | "bad" | "warn" | "muted";
  /** A second, smaller line (words that were nearly right). */
  note?: string;
}) {
  const color = tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : "var(--muted)";
  return (
    <div className="rounded-2xl border-2 border-ink/10 bg-surface-2 p-3 text-center">
      <div className="text-3xl font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="text-sm font-bold text-ink/60">{label}</div>
      {note && <div className="mt-0.5 text-xs font-semibold text-ink/50">{note}</div>}
    </div>
  );
}


function formatTime(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
