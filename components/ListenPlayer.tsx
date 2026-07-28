"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ayahAudioUrl } from "@/lib/audio-quran";
import { useReciter } from "@/lib/reciter-store";
import { surahMeta } from "@/lib/quran";

interface Props {
  /** Surah currently shown in the reader. */
  surahId: number;
  /** Keep the reader in sync as playback flows into the next/previous surah. */
  onSurahChange: (id: number) => void;
}

/**
 * A hands-free listening player: press play and Dugsi recites the whole surah
 * verse by verse in your chosen Sheikh's voice, then flows straight into the
 * next surah — so you can listen to the entire Quran, e.g. while driving. It
 * hooks into the phone's Media Session so the lock-screen and headphone
 * controls (play / pause / skip) drive it too.
 */
export default function ListenPlayer({ surahId, onSurahChange }: Props) {
  const { reciter, reciterId } = useReciter();
  const meta = surahMeta(surahId)!;
  const ayahCount = meta.ayahCount;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [verse, setVerse] = useState(1);
  const [intendPlay, setIntendPlay] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

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

  return (
    <div className="rounded-2xl border border-emerald/20 bg-emerald-dark px-5 py-4 text-white shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-gold-soft/80">Listen to the Quran</p>
          <p className="truncate text-base font-semibold">
            {meta.transliteration}
            <span className="text-white/50"> · </span>
            <span className="text-white/70">
              {status === "error"
                ? "Couldn't load audio"
                : intendPlay
                  ? `Verse ${verse} of ${ayahCount}`
                  : `${ayahCount} verses`}
            </span>
          </p>
          <p className="ayah mt-0.5 truncate text-lg text-gold-soft" dir="rtl">
            {reciter.arabicName}
          </p>
        </div>
        <button
          onClick={() => setRepeat((r) => !r)}
          aria-pressed={repeat}
          title={repeat ? "Repeating this surah" : "Repeat this surah"}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 transition ${
            repeat ? "bg-gold/20 text-gold-soft ring-gold/40" : "text-white/60 ring-white/15 hover:text-white"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
          </svg>
        </button>
      </div>

      {/* Progress line */}
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-gold transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Transport */}
      <div className="mt-3 flex items-center justify-center gap-6">
        <button
          onClick={goPrev}
          aria-label="Previous verse"
          className="grid h-10 w-10 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
          </svg>
        </button>

        <button
          onClick={togglePlay}
          aria-label={intendPlay ? "Pause" : "Play"}
          className="grid h-14 w-14 place-items-center rounded-full bg-gold text-emerald-dark shadow-soft transition hover:brightness-105 active:scale-95"
        >
          {status === "loading" && intendPlay ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-dark/40 border-t-emerald-dark" />
          ) : intendPlay ? (
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={goNext}
          aria-label="Next verse"
          className="grid h-10 w-10 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
            <path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" />
          </svg>
        </button>
      </div>

      <p className="mt-3 text-center text-[11px] text-white/50">
        {repeat
          ? "Repeating this surah."
          : "Plays on through the next surah — listen hands-free, even with the screen off."}
      </p>
    </div>
  );
}
