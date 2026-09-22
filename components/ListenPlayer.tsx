"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReciter } from "@/lib/reciter-store";
import { surahMeta } from "@/lib/quran";
import { loadTimings, wordAt, type SurahTimings } from "@/lib/quran/timings";
import {
  audioCacheSupported,
  forgetSurah,
  saveSurah,
  savedCount,
  type SaveProgress,
} from "@/lib/audio-cache";
import {
  liveAudio,
  next as engineNext,
  pause as enginePause,
  play as enginePlay,
  previous as enginePrev,
  seek,
  setRate,
  setReciter,
  setRepeat,
  useListen,
} from "@/lib/listen-engine";

interface Props {
  /** Surah currently shown in the reader. */
  surahId: number;
  /** Keep the reader in sync as the recitation flows into the next surah. */
  onSurahChange: (id: number) => void;
  /** Word being recited right now (verse, index in verse), or null. Only for
   *  Sheikhs with word timings; verse-level otherwise. */
  onWordChange?: (pos: { verse: number; word: number } | null) => void;
  /** Verse to start from (a bookmark or a deep link). */
  startVerse?: number;
}

/**
 * A hands-free listening player: press play and Dugsi recites verse by verse in
 * your chosen Sheikh's voice, then flows straight into the next surah — so you
 * can listen to the whole Quran, e.g. while driving. The sound itself is driven
 * by lib/listen-engine.ts, which keeps the next ayah loaded and ready, so there
 * is no pause between verses and none between surahs either. This component is
 * the controls: the buttons, the lock-screen card, and saving a surah to the
 * device so it plays with no network at all.
 */
export default function ListenPlayer({ surahId, onSurahChange, onWordChange, startVerse }: Props) {
  const { reciter, reciterId } = useReciter();
  const listen = useListen();
  const meta = surahMeta(surahId)!;
  const ayahCount = meta.ayahCount;
  const verse = listen.at.surah === surahId ? listen.at.verse : 1;

  const [timings, setTimings] = useState<SurahTimings | null>(null);

  // The engine plays in whichever voice is chosen, and keeps the same ayah
  // when the listener switches Sheikh mid-recitation.
  useEffect(() => {
    setReciter(reciterId);
  }, [reciterId]);

  // Opening the player lines the recitation up with the page on screen — the
  // engine may still be sitting where a previous visit left it — and closing it
  // stops the sound.
  const opening = useRef({ surahId, startVerse });
  useEffect(() => {
    const { surahId: s, startVerse: v } = opening.current;
    seek({ surah: s, verse: v && v >= 1 ? v : 1 });
    return () => enginePause();
  }, []);

  // Two-way sync with the reader, without the two chasing each other: a surah
  // picked in the reader moves the recitation, and a recitation that flows into
  // the next surah moves the reader.
  const shownSurah = useRef(surahId);
  const settled = useRef(false);
  useEffect(() => {
    if (surahId === shownSurah.current) return;
    shownSurah.current = surahId;
    seek({ surah: surahId, verse: 1 });
  }, [surahId]);

  useEffect(() => {
    // The first pass still sees where the engine was before we lined it up.
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (listen.at.surah === shownSurah.current) return;
    shownSurah.current = listen.at.surah;
    onSurahChange(listen.at.surah);
  }, [listen.at.surah, onSurahChange]);

  // A bookmark or a deep link opens at its verse.
  const linkedVerse = useRef(startVerse);
  useEffect(() => {
    if (startVerse === linkedVerse.current) return;
    linkedVerse.current = startVerse;
    if (startVerse && startVerse >= 1 && startVerse <= ayahCount) {
      seek({ surah: surahId, verse: startVerse });
    }
  }, [startVerse, surahId, ayahCount]);

  // Word timings for this Sheikh + surah (quran-align data), for read-along.
  useEffect(() => {
    let cancelled = false;
    setTimings(null);
    void loadTimings(reciterId, listen.at.surah).then((t) => !cancelled && setTimings(t));
    return () => {
      cancelled = true;
    };
  }, [reciterId, listen.at.surah]);

  // Follow the qari word by word while playing (or verse by verse without timings).
  useEffect(() => {
    if (!onWordChange) return;
    if (!listen.playing || listen.at.surah !== surahId) {
      onWordChange(null);
      return;
    }
    let raf = 0;
    let last = -2;
    const at = listen.at.verse;
    const tick = () => {
      const a = liveAudio();
      const times = timings?.[String(at)];
      const w = a && times ? wordAt(times, a.currentTime * 1000) : 0;
      if (w !== last) {
        last = w;
        onWordChange({ verse: at, word: Math.max(0, w) });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [listen.playing, listen.at.surah, listen.at.verse, surahId, timings, onWordChange]);

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
    ms.setActionHandler("play", enginePlay);
    ms.setActionHandler("pause", enginePause);
    ms.setActionHandler("previoustrack", enginePrev);
    ms.setActionHandler("nexttrack", engineNext);
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = listen.playing ? "playing" : "paused";
  }, [listen.playing]);

  const progress = ayahCount > 1 ? ((verse - 1) / (ayahCount - 1)) * 100 : 0;
  const rates = [0.75, 1, 1.25];
  const nextRate = () => setRate(rates[(rates.indexOf(listen.rate) + 1) % rates.length]);

  return (
    <div className="sticky bottom-[5.6rem] z-30">
      <div className="card p-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setRepeat(!listen.repeat)}
            aria-pressed={listen.repeat}
            title={listen.repeat ? "Repeating this surah" : "Repeat this surah"}
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 transition ${
              listen.repeat ? "border-gold bg-gold/15 text-gold-soft" : "border-ink/15 text-ink/60 hover:border-ink/30"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
              <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <button onClick={enginePrev} aria-label="Previous verse" className="icon-btn h-14 w-14">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
              </svg>
            </button>
            <button
              onClick={() => (listen.playing ? enginePause() : enginePlay())}
              aria-label={listen.playing ? "Pause" : "Play"}
              className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-emerald text-white shadow-soft transition hover:brightness-105 active:scale-95"
            >
              {listen.status === "loading" && listen.playing ? (
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/40 border-t-white" />
              ) : listen.playing ? (
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
            <button onClick={engineNext} aria-label="Next verse" className="icon-btn h-14 w-14">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden>
                <path d="M16 6h2v12h-2V6zM6 6l8.5 6L6 18V6z" />
              </svg>
            </button>
          </div>

          <button
            onClick={nextRate}
            aria-label={`Speed ${listen.rate}, tap to change`}
            className={`h-12 w-14 shrink-0 rounded-full border-2 text-sm font-extrabold transition ${
              listen.rate !== 1 ? "border-gold bg-gold/15 text-gold-soft" : "border-ink/15 text-ink/60 hover:border-ink/30"
            }`}
          >
            {listen.rate}×
          </button>
        </div>

        <p className="mt-2 text-center text-sm font-bold text-ink/70">
          {listen.status === "error"
            ? "Couldn't load the audio. Try another Sheikh."
            : listen.playing
              ? `Verse ${verse} of ${ayahCount}${listen.repeat ? " · repeating" : ""}`
              : `Tap play to hear ${reciter.name} recite ${meta.transliteration}`}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-emerald transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>

        <SaveSurah surahId={surahId} ayahCount={ayahCount} reciterId={reciterId} />
      </div>
    </div>
  );
}

/**
 * Keep this surah, in this Sheikh's voice, on the phone. A saved surah plays
 * with no network at all — useful on a weak connection, on the metro, or when
 * a child listens to the same surah every day.
 */
function SaveSurah({ surahId, ayahCount, reciterId }: { surahId: number; ayahCount: number; reciterId: string }) {
  const [saved, setSaved] = useState<number | null>(null);
  const [progress, setProgress] = useState<SaveProgress | null>(null);
  const abort = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    let cancelled = false;
    void savedCount(surahId, reciterId).then((n) => !cancelled && setSaved(n));
    return () => {
      cancelled = true;
    };
  }, [surahId, reciterId]);

  useEffect(() => refresh(), [refresh]);

  useEffect(() => {
    return () => abort.current?.abort();
  }, []);

  if (!audioCacheSupported()) return null;

  const done = saved !== null && saved >= ayahCount;

  const start = () => {
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ done: 0, total: ayahCount });
    void saveSurah(surahId, reciterId, setProgress, controller.signal).finally(() => {
      abort.current = null;
      setProgress(null);
      refresh();
    });
  };

  const remove = () => {
    void forgetSurah(surahId, reciterId).then(refresh);
  };

  if (progress) {
    const pct = Math.round((progress.done / Math.max(1, progress.total)) * 100);
    return (
      <div className="mt-2 flex items-center justify-center gap-2 text-sm font-bold text-ink/60">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        Saving to this device… {pct}%
        <button onClick={() => abort.current?.abort()} className="underline underline-offset-2 hover:text-ink">
          Stop
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 text-center text-sm font-bold text-ink/60">
      {done ? (
        <>
          <span className="text-emerald-bright">✓ Saved on this device</span>{" "}
          <button onClick={remove} className="underline underline-offset-2 hover:text-ink">
            Remove
          </button>
        </>
      ) : (
        <button onClick={start} className="underline underline-offset-2 hover:text-ink">
          Save this surah to listen without internet
        </button>
      )}
    </div>
  );
}
