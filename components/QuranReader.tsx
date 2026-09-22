"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Reciter from "./Reciter";
import SurahPicker from "./SurahPicker";
import ReciterPicker from "./ReciterPicker";
import ReciterAvatar from "./ReciterAvatar";
import SurahView from "./SurahView";
import ListenPlayer from "./ListenPlayer";
import PageHeader from "./PageHeader";
import OptionsSheet from "./OptionsSheet";
import Legend from "./Legend";
import { NavIcon } from "./BottomNav";
import { surahMeta, loadSurah, type Surah } from "@/lib/quran";
import { useReading, setReading, type Mode, type Reading } from "@/lib/reading-store";
import { useReciter } from "@/lib/reciter-store";
import { useReaderPosition } from "@/lib/reader-store";
import { useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { loadFurthest, resetFurthest } from "@/lib/supabase/progress";
import { PAGE_COUNT, pageStart, surahStartingOn } from "@/lib/quran/layout";

/** Deep links: /quran?surah=2&verse=255, &from=1&to=5, ?page=440, &mode=listen. */
function applyUrl(): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  if (!q.toString()) return;
  const num = (k: string) => {
    const v = Number(q.get(k));
    return v > 0 ? v : undefined;
  };
  const patch: Partial<Reading> = {};
  const mode = q.get("mode");
  if (mode === "listen" || mode === "recite") patch.mode = mode;
  let surah = num("surah");
  let verse = num("verse");
  const page = num("page");
  if (!surah && page && page <= PAGE_COUNT) {
    const opening = surahStartingOn(page);
    if (opening) {
      surah = opening;
      verse = 1;
    } else {
      const s = pageStart(page);
      surah = s.surah;
      verse = s.ayah;
    }
  }
  if (surah && surah >= 1 && surah <= 114) {
    const m = surahMeta(surah)!;
    const clamp = (v: number | undefined) => (v ? Math.max(1, Math.min(m.ayahCount, v)) : undefined);
    const from = clamp(num("from"));
    const to = clamp(num("to"));
    patch.surah = surah;
    patch.range = from && to && to >= from && m.ayahCount > 10 ? { from, to } : null;
    patch.verse = clamp(verse);
  }
  if (Object.keys(patch).length) setReading(patch);
}

/**
 * The Quran page: the printed mushaf with two ways to use it, Listen (the
 * Sheikh reads, words turn green) and Recite (you read, words turn green,
 * yellow or red). The surah and Sheikh are chosen on the home page and can be
 * changed from the header here.
 */
export default function QuranReader() {
  const reading = useReading();
  const { reciter } = useReciter();
  const settings = useSettings();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const pos = useReaderPosition();

  const [ready, setReady] = useState(false);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState(false);
  const [resumeVerse, setResumeVerse] = useState(0);

  useEffect(() => {
    applyUrl();
    setReady(true);
  }, []);

  const meta = surahMeta(reading.surah)!;
  const isLong = meta.ayahCount > 10;
  const range = reading.range;
  // A chosen range is practised like a short surah: whole range visible and scored.
  const trackProgress = isLong && !range && reading.mode === "recite";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadSurah(reading.surah)
      .then((s) => {
        if (!cancelled) {
          setSurah(s);
          setLoading(false);
        }
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reading.surah]);

  // Where the reader left off (from their account, or this device).
  useEffect(() => {
    if (!trackProgress || !surah) {
      setResumeVerse(0);
      return;
    }
    let cancelled = false;
    loadFurthest(userId, reading.surah).then((v) => !cancelled && setResumeVerse(v));
    return () => {
      cancelled = true;
    };
  }, [trackProgress, surah, reading.surah, userId]);

  const ayat = useMemo(() => {
    if (!surah) return null;
    if (!range) return surah.ayat;
    return surah.ayat.filter((a) => a.number >= range.from && a.number <= range.to);
  }, [surah, range]);

  const selectSurah = (id: number) => {
    if (id === reading.surah) return;
    setReading({ surah: id, verse: undefined });
    setSurah(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };
  const setMode = (mode: Mode) => setReading({ mode });
  const startOver = () => {
    if (trackProgress) resetFurthest(userId, reading.surah);
    setResumeVerse(0);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showing = ready && !loading && surah && ayat;

  return (
    <>
      <PageHeader
        back={{ href: "/", label: "Home" }}
        title={
          <button onClick={() => window.dispatchEvent(new Event("dugsi:open-picker"))} className="flex max-w-full items-center gap-1 text-left" aria-label="Change surah">
            <span className="truncate">{meta.transliteration}</span>
            <NavIcon name="chevron" className="h-5 w-5 shrink-0 rotate-90 text-ink/40" />
          </button>
        }
        sub={`Surah ${meta.id} · Page ${pos.surah === meta.id && pos.page ? pos.page : "…"} · Verse ${pos.surah === meta.id ? pos.verse : 1}`}
        right={
          <>
            <button
              onClick={() => window.dispatchEvent(new Event("dugsi:open-reciters"))}
              aria-label={`Sheikh: ${reciter.name}. Change`}
              className="flex shrink-0 items-center gap-2 rounded-full border-2 border-ink/10 bg-surface py-0.5 pl-0.5 pr-3 transition hover:border-emerald/50"
            >
              <ReciterAvatar reciter={reciter} size={36} />
              <span className="hidden max-w-[7rem] truncate text-sm font-bold text-ink sm:block">{reciter.name}</span>
            </button>
            <button onClick={() => setOptions(true)} aria-label="Options" className="icon-btn">
              <NavIcon name="gear" className="h-7 w-7" />
            </button>
          </>
        }
      />
      <SurahPicker current={reading.surah} onSelect={selectSurah} />
      <ReciterPicker />
      {options && <OptionsSheet surahId={reading.surah} ayahCount={meta.ayahCount} range={range} onClose={() => setOptions(false)} />}

      <main className="mx-auto max-w-3xl px-3 pb-8 pt-3 sm:px-4">
        {/* Listen or recite */}
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl border-2 border-ink/10 bg-surface p-1">
          <ModeButton on={reading.mode === "listen"} icon="play" label="Listen" onClick={() => setMode("listen")} />
          <ModeButton on={reading.mode === "recite"} icon="mic" label="Recite" onClick={() => setMode("recite")} />
        </div>

        {range && reading.mode === "recite" && (
          <p className="mb-3 text-center text-sm font-semibold text-ink/60">
            Practising verses {range.from}–{range.to} only.{" "}
            <button onClick={() => setReading({ range: null })} className="underline underline-offset-2 hover:text-ink">
              Whole surah
            </button>
          </p>
        )}
        {resumeVerse > 1 && !reading.verse && reading.mode === "recite" && (
          <p className="mb-3 text-center text-sm font-semibold text-ink/60">
            Continuing from verse {resumeVerse}.{" "}
            <button onClick={startOver} className="underline underline-offset-2 hover:text-ink">
              Start from the beginning
            </button>
          </p>
        )}

        {!showing ? (
          <div className="flex justify-center py-16 text-ink/60">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-gold border-t-transparent" />
          </div>
        ) : reading.mode === "recite" ? (
          <Reciter ayat={ayat} surahNumber={reading.surah} trackProgress={trackProgress} startVerse={range ? undefined : reading.verse} />
        ) : (
          <ListenSection surah={surah} surahId={reading.surah} startVerse={reading.verse} onSurahChange={selectSurah} />
        )}

        {settings.showTajweed && showing && (
          <div className="mt-8">
            <Legend />
          </div>
        )}
      </main>
    </>
  );
}

function ModeButton({ on, icon, label, onClick }: { on: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl text-lg font-extrabold transition ${
        on ? "bg-emerald text-white shadow-soft" : "text-ink/60 hover:bg-ink/5"
      }`}
    >
      <NavIcon name={icon} className="h-6 w-6" />
      {label}
    </button>
  );
}

/** Listening: the pages, with the word the Sheikh is reciting turning green,
 *  and the player docked below. */
function ListenSection({
  surah,
  surahId,
  startVerse,
  onSurahChange,
}: {
  surah: Surah;
  surahId: number;
  startVerse?: number;
  onSurahChange: (id: number) => void;
}) {
  const settings = useSettings();
  const [pos, setPos] = useState<{ verse: number; word: number } | null>(null);
  const offsets = useMemo(() => {
    const o = new Map<number, number>();
    let acc = 0;
    for (const a of surah.ayat) {
      o.set(a.number, acc);
      acc += a.words.length;
    }
    return o;
  }, [surah]);
  const activeIndex = pos && offsets.has(pos.verse) ? offsets.get(pos.verse)! + pos.word : undefined;
  const onWordChange = useCallback((p: { verse: number; word: number } | null) => setPos(p), []);

  return (
    <div className="space-y-4">
      <div className="karaoke">
        <SurahView
          ayat={surah.ayat}
          surahNumber={surahId}
          showTajweed={settings.showTajweed}
          activeIndex={activeIndex}
          showTranslation={settings.showTranslation}
          showTranslit={settings.showTranslit}
          initialTopVerse={startVerse}
        />
      </div>
      <ListenPlayer surahId={surahId} startVerse={startVerse} onSurahChange={onSurahChange} onWordChange={onWordChange} />
    </div>
  );
}
