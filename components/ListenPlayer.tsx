"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ayahAudioUrl } from "@/lib/audio-quran";
import { useReciter } from "@/lib/reciter-store";
import { surahMeta } from "@/lib/quran";
import { loadTimings, wordAt, type SurahTimings } from "@/lib/quran/timings";

interface Props {
  /** Surah currently shown in the reader. */
  surahId: number;
  /** Keep the reader in sync as playback flows into the next/previous surah. */
  onSurahChange: (id: number) => void;
  /** Word being recited right now (verse, index in verse), or null. Only for
   *  Sheikhs with word timings; verse-level otherwise. */
  onWordChange?: (pos: { verse: number; word: number } | null) => void;
  /** Verse to start from (a bookmark or a deep link). */
  startVerse?: number;
}

/**
 * A hands-free listening player: press play and Dugsi recites the whole surah
 * verse by verse in your chosen Sheikh's voice, then flows straight into the
 * next surah — so you can listen to the entire Quran, e.g. while driving. It
 * hooks into the phone's Media Session so the lock-screen and headphone
 * controls (play / pause / skip) drive it too.
 */
export default function ListenPlayer({ surahId, onSurahChange, onWordChange, startVerse }: Props) {
  const { reciter, reciterId } = useReciter();
  const meta = surahMeta(surahId)!;
  const ayahCount = meta.ayahCount;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [verse, setVerse] = useState(startVerse && startVerse <= ayahCount ? startVerse : 1);
  const [intendPlay, setIntendPlay] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [rate, setRate] = useState(1);
  const [timings, setTimings] = useState<SurahTimings | null>(null);

  // Word timings for this Sheikh + surah (quran-align data), for read-along.
  useEffect(() => {
    let cancelled = false;
    setTimings(null);
    void loadTimings(reciterId, surahId).then((t) => !cancelled && setTimings(t));
    return () => {
      cancelled = true;
    };
  }, [reciterId, surahId]);

  // Follow the qari word by word while playing (or verse by verse without timings).
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !onWordChange) return;
    if (!intendPlay) {
      onWordChange(null);
      return;
    }
    let raf = 0;
    let last = -2;
    const tick = () => {
      const times = timings?.[String(verse)];
      const w = times ? wordAt(times, a.currentTime * 1000) : 0;
      if (w !== last) {
        last = w;
        onWordChange({ verse, word: Math.max(0, w) });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [intendPlay, verse, timings, onWordChange]);

  // Playback speed (slower to shadow a verse, faster to review).
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = rate;
  }, [rate, verse, surahId, reciterId]);

  // When the surah changes — a manual pick or an auto-advance into the next
  // surah — restart at its first verse. Doing it during render (rather than in an
  // effect) means the new surah is never briefly paired with the old verse index.
  const [prevSurahId, setPrevSurahId] = useState(surahId);
  if (surahId !== prevSurahId) {
    setPrevSurahId(surahId);
    setVerse(1);
  }

  // One audio element for the whole session.
  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    audioRef.current = a;
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, []);

  // Drive the element: load & play the current ayah while we intend to play,
  // pause otherwise. Changing Sheikh mid-verse reloads it in the new voice.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!intendPlay) {
      a.pause();
      return;
    }
    const url = ayahAudioUrl(surahId, verse, reciterId);
    if (a.src !== url) a.src = url;
    setStatus("loading");
    let cancelled = false;
    a.play()
      .then(() => !cancelled && setStatus("idle"))
      .catch((err: unknown) => {
        // A rapid src change (skip / switch Sheikh) aborts the previous play —
        // that's expected, not a load failure.
        if (!cancelled && (err as { name?: string })?.name !== "AbortError") setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [surahId, verse, reciterId, intendPlay]);

  // When an ayah finishes, flow to the next — next verse, next surah, or (with
  // repeat on) back to this surah's first verse.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnded = () => {
      if (verse < ayahCount) setVerse((v) => v + 1);
      else if (repeat) setVerse(1);
      else if (surahId < 114) onSurahChange(surahId + 1);
      else setIntendPlay(false);
    };
    const onPlaying = () => setStatus("idle");
    const onWaiting = () => setStatus("loading");
    const onError = () => setStatus("error");
    a.addEventListener("ended", onEnded);
    a.addEventListener("playing", onPlaying);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("error", onError);
    };
  }, [verse, ayahCount, repeat, surahId, onSurahChange]);

  const goNext = useCallback(() => {
    if (verse < ayahCount) setVerse((v) => v + 1);
    else if (surahId < 114) onSurahChange(surahId + 1);
  }, [verse, ayahCount, surahId, onSurahChange]);

  const goPrev = useCallback(() => {
    if (verse > 1) setVerse((v) => v - 1);
    else if (surahId > 1) onSurahChange(surahId - 1);
  }, [verse, surahId, onSurahChange]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (intendPlay) {
      setIntendPlay(false);
      return;
    }
    // Kick playback off inside the click itself so iOS Safari (which only
    // allows audio to start from a user gesture) lets it through; the effect
    // then keeps it going as verses and surahs advance.
    if (a) {
      const url = ayahAudioUrl(surahId, verse, reciterId);
      if (a.src !== url) a.src = url;
      setStatus("loading");
      a.play()
        .then(() => setStatus("idle"))
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name !== "AbortError") setStatus("error");
        });
    }
    setIntendPlay(true);
  };

  // Lock-screen / headphone controls, plus a "now playing" card on the phone.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${meta.transliteration} · verse ${verse} of ${ayahCount}`,
        artist: reciter.name,
        album: "Dugsi — Listen to the Quran",
      });
    } catch {
      // Some browsers restrict MediaMetadata — safe to skip.
    }
  }, [meta.transliteration, verse, ayahCount, reciter.name]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => setIntendPlay(true));
    ms.setActionHandler("pause", () => setIntendPlay(false));
    ms.setActionHandler("previoustrack", goPrev);
    ms.setActionHandler("nexttrack", goNext);
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
    };
  }, [goPrev, goNext]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = intendPlay ? "playing" : "paused";
  }, [intendPlay]);

  const progress = ayahCount > 1 ? ((verse - 1) / (ayahCount - 1)) * 100 : 0;
  const rates = [0.75, 1, 1.25];
  const nextRate = () => setRate((r) => rates[(rates.indexOf(r) + 1) % rates.length]);

  return (
    <div className="sticky bottom-[5.6rem] z-30">
      <div className="card p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setRepeat((r) => !r)}
            aria-pressed={repeat}
            title={repeat ? "Repeating this surah" : "Repeat this surah"}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 transition ${
              repeat ? "border-gold bg-gold/15 text-gold-soft" : "border-ink/15 text-ink/60 hover:border-ink/30"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <button onClick={goPrev} aria-label="Previous verse" className="icon-btn h-14 w-14">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
              </svg>
            </button>
            <button
              onClick={togglePlay}
              aria-label={intendPlay ? "Pause" : "Play"}
              className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-emerald text-white shadow-soft transition hover:brightness-105 active:scale-95"
            >
              {status === "loading" && intendPlay ? (
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/40 border-t-white" />
              ) : intendPlay ? (
                <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor" aria-hidden>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button onClick={goNext} aria-label="Next verse" className="icon-btn h-14 w-14">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
                <path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" />
              </svg>
            </button>
          </div>

          <button
            onClick={nextRate}
            aria-label={`Speed ${rate}, tap to change`}
            className={`h-12 w-14 shrink-0 rounded-full border-2 text-sm font-extrabold transition ${
              rate !== 1 ? "border-gold bg-gold/15 text-gold-soft" : "border-ink/15 text-ink/60 hover:border-ink/30"
            }`}
          >
            {rate}×
          </button>
        </div>

        <p className="mt-2 text-center text-sm font-bold text-ink/70">
          {status === "error"
            ? "Couldn't load the audio. Try another Sheikh."
            : intendPlay
              ? `Verse ${verse} of ${ayahCount}${repeat ? " · repeating" : ""}`
              : `Tap play to hear ${reciter.name} recite ${meta.transliteration}`}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-emerald transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
