"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { Ayah } from "@/lib/quran/types";
import { surahMeta } from "@/lib/quran";
import { primaryRuleColor } from "@/lib/tajweed/rules";
import type { WordStatus } from "@/lib/align";
import PlayButton from "./PlayButton";
import BookmarkButton from "./BookmarkButton";

interface Props {
  ayat: Ayah[];
  /** Surah number, for the per-verse reciter audio. */
  surahNumber: number;
  statuses?: Record<number, WordStatus>;
  maddVerdicts?: Record<number, "good" | "rushed" | "unknown">;
  showTajweed?: boolean;
  /** The next expected word while reciting live — gets a cursor + auto-follow. */
  activeIndex?: number;
  /** Memorisation: 0 = off, 1 = easy, 2 = medium, 3 = hide all. Masked words
   *  reveal on tap, or automatically when recited correctly. */
  maskLevel?: number;
  /** 1-based verse to start at (resume). */
  initialTopVerse?: number;
  /** Reports the 1-based verse nearest the top as the reader scrolls. */
  onTopVerseChange?: (verse: number) => void;
  /** Controlled set of hidden words the reader has opened (memorisation).
   *  When omitted the view keeps its own. */
  revealed?: Set<number>;
  onReveal?: (refIndex: number) => void;
  /** Show verse bookmark toggles. */
  bookmarks?: boolean;
  /** Translation / transliteration under each verse. */
  showTranslation?: boolean;
  showTranslit?: boolean;
  /** Surah banner + basmala at the top of the page (off when showing a range). */
  header?: boolean;
}

/** Fraction of words hidden at each Hifz level. */
function hideThreshold(level: number): number {
  return level === 1 ? 35 : level === 2 ? 70 : level >= 3 ? 100 : 0;
}

/** Deterministic per-word masking so the hidden set is stable across renders. */
export function isMaskedSlot(refIndex: number, level: number): boolean {
  if (level <= 0) return false;
  const h = Math.imul(refIndex + 1, 2654435761) >>> 0;
  return h % 100 < hideThreshold(level);
}

const statusClass: Record<WordStatus, string> = {
  correct: "word-correct",
  close: "word-close",
  wrong: "word-wrong",
  missing: "word-missing",
};

function toArabicNumeral(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

interface VerseProps {
  ayah: Ayah;
  index: number;
  surahNumber: number;
  baseRefIndex: number;
  statuses?: Record<number, WordStatus>;
  maddVerdicts?: Record<number, "good" | "rushed" | "unknown">;
  showTajweed: boolean;
  /** Colour every word of every verse. Off for long surahs (kept light so iOS
   *  Safari doesn't run out of memory) — they only colour the active/scored verse. */
  tajweedEveryWord: boolean;
  activeIndex?: number;
  maskLevel: number;
  revealed?: Set<number>;
  onReveal?: (refIndex: number) => void;
  bookmarks: boolean;
  showTranslation: boolean;
  showTranslit: boolean;
}

const VerseBlock = memo(function VerseBlock({
  ayah,
  surahNumber,
  baseRefIndex,
  statuses,
  maddVerdicts,
  showTajweed,
  tajweedEveryWord,
  activeIndex,
  maskLevel,
  revealed,
  onReveal,
  bookmarks,
  showTranslation,
  showTranslit,
}: VerseProps) {
  const hasFeedback = !!statuses;
  const len = ayah.words.length;

  // Render per-word spans only when a verse needs them (recited / has marks /
  // tajweed-coloured / memorisation masking); otherwise a single text node.
  let needWords =
    maskLevel > 0 ||
    (activeIndex !== undefined && activeIndex >= baseRefIndex && activeIndex < baseRefIndex + len);
  if (!needWords) {
    for (let i = 0; i < len; i++) {
      const idx = baseRefIndex + i;
      if (statuses?.[idx] || maddVerdicts?.[idx]) {
        needWords = true;
        break;
      }
      if (tajweedEveryWord && !hasFeedback && showTajweed && (ayah.words[i].rules?.length ?? 0) > 0) {
        needWords = true;
        break;
      }
    }
  }

  // Memorising: the transliteration would give the words away, and the
  // translation is a strong hint — hide them as the level rises.
  const translit = showTranslit && maskLevel === 0 ? ayah.translit : undefined;
  const translation = showTranslation && maskLevel < 2 ? ayah.translation : undefined;

  return (
    <div className="ayah-block py-1">
      <p className="ayah">
        {needWords ? (
          ayah.words.map((word, i) => {
            const idx = baseRefIndex + i;
            const status = statuses?.[idx];
            const madd = maddVerdicts?.[idx];
            // Memorisation: hide the word unless tapped open or recited correctly.
            const said = status === "correct" || status === "close";
            const masked = maskLevel > 0 && isMaskedSlot(idx, maskLevel) && !revealed?.has(idx) && !said;
            if (masked) {
              return (
                <span
                  key={i}
                  className="word word-mask"
                  onClick={() => onReveal?.(idx)}
                  role="button"
                  tabIndex={0}
                  aria-label="Hidden word — tap to reveal"
                >
                  {word.uthmani}{" "}
                </span>
              );
            }
            const colorClass = !hasFeedback && showTajweed ? primaryRuleColor(word.rules ?? []) : null;
            const statusBg = status ? statusClass[status] : "";
            const active = activeIndex === idx ? "word-active" : "";
            return (
              <span key={i} className={`word ${colorClass ?? ""} ${statusBg} ${active}`} title={word.translit}>
                {word.uthmani}
                {madd === "rushed" && (
                  <sup className="ml-0.5 text-xs text-red-600" title="Elongation may be rushed">
                    ⏱
                  </sup>
                )}{" "}
              </span>
            );
          })
        ) : (
          <span>{ayah.words.map((w) => w.uthmani).join(" ")} </span>
        )}
        <span className="ayah-medallion mx-1">{toArabicNumeral(ayah.number)}</span>
      </p>
      {/* A quiet tools line: listen, bookmark, and the translation if shown. */}
      <div className="mb-3 flex items-start gap-2 text-[13px] leading-relaxed text-paper-ink/70" dir="ltr">
        <span className="verse-tools mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-paper-deep/60 px-1 text-paper-ink/70">
          <PlayButton surah={surahNumber} ayah={ayah.number} />
          {bookmarks && <BookmarkButton surah={surahNumber} verse={ayah.number} />}
        </span>
        <span className="min-w-0 flex-1">
          {translit && <span className="block italic text-paper-ink/60">{translit}</span>}
          {translation && (
            <span className="block">
              <span className="mr-1 text-[10px] font-semibold text-gold-deep/80">{ayah.number}</span>
              {translation}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}, versesEqual);

function versesEqual(prev: VerseProps, next: VerseProps): boolean {
  if (prev.showTajweed !== next.showTajweed) return false;
  if (prev.tajweedEveryWord !== next.tajweedEveryWord) return false;
  if (prev.maskLevel !== next.maskLevel) return false;
  if (prev.bookmarks !== next.bookmarks) return false;
  if (prev.showTranslation !== next.showTranslation || prev.showTranslit !== next.showTranslit) return false;
  if (prev.ayah !== next.ayah || prev.baseRefIndex !== next.baseRefIndex || prev.index !== next.index) return false;

  const base = next.baseRefIndex;
  const len = next.ayah.words.length;
  const prevActiveHere = prev.activeIndex !== undefined && prev.activeIndex >= base && prev.activeIndex < base + len;
  const nextActiveHere = next.activeIndex !== undefined && next.activeIndex >= base && next.activeIndex < base + len;
  if ((prevActiveHere || nextActiveHere) && prev.activeIndex !== next.activeIndex) return false;

  for (let i = 0; i < len; i++) {
    const idx = base + i;
    if (prev.statuses?.[idx] !== next.statuses?.[idx]) return false;
    if (prev.maddVerdicts?.[idx] !== next.maddVerdicts?.[idx]) return false;
    if (next.maskLevel > 0 && (prev.revealed?.has(idx) ?? false) !== (next.revealed?.has(idx) ?? false)) return false;
  }
  return true;
}

/** The ornamental surah banner and, where the mushaf prints it, the basmala. */
export function SurahHeader({ surahNumber }: { surahNumber: number }) {
  const meta = surahMeta(surahNumber);
  if (!meta) return null;
  // Al-Fatiha's first verse *is* the basmala; At-Tawbah has none.
  const basmala = surahNumber !== 1 && surahNumber !== 9;
  return (
    <div className="mb-3 text-center">
      <div className="surah-banner mx-auto flex max-w-sm items-center justify-between gap-3 px-5 py-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-gold-deep/80">{meta.type === "meccan" ? "Makkiyyah" : "Madaniyyah"}</span>
        <span className="font-quran text-2xl text-paper-ink" dir="rtl">
          سُورَةُ {meta.nameArabic}
        </span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-gold-deep/80">{meta.ayahCount} āyāt</span>
      </div>
      {basmala && (
        <p className="basmala mt-3" dir="rtl">
          بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
        </p>
      )}
    </div>
  );
}

export default function SurahView({
  ayat,
  surahNumber,
  statuses,
  maddVerdicts,
  showTajweed = true,
  activeIndex,
  maskLevel = 0,
  initialTopVerse,
  onTopVerseChange,
  revealed: revealedProp,
  onReveal: onRevealProp,
  bookmarks = false,
  showTranslation = true,
  showTranslit = false,
  header = true,
}: Props) {
  const wordOffsets = useMemo(() => {
    const o: number[] = [];
    let acc = 0;
    for (const a of ayat) {
      o.push(acc);
      acc += a.words.length;
    }
    return o;
  }, [ayat]);

  // Words the reader has tapped open (in addition to ones revealed by reciting).
  // Controlled by the parent when it needs to peek programmatically.
  const [ownRevealed, setOwnRevealed] = useState<Set<number>>(() => new Set());
  useEffect(() => {
    setOwnRevealed(new Set());
  }, [ayat, maskLevel]);
  const ownReveal = useCallback((refIndex: number) => {
    setOwnRevealed((prev) => {
      const next = new Set(prev);
      next.add(refIndex);
      return next;
    });
  }, []);
  const revealed = revealedProp ?? ownRevealed;
  const reveal = onRevealProp ?? ownReveal;

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const verseEls = useRef<(HTMLDivElement | null)[]>([]);
  const lastActiveVerse = useRef(-1);
  const virtualized = ayat.length > 20;
  const showHeader = header && ayat.length > 0 && ayat[0].number === 1;

  // Follow the reciter, book-style: keep the verse being recited centred (a touch
  // above centre, so the next verse peeks in and you can read on without ever
  // scrolling yourself).
  useEffect(() => {
    if (activeIndex === undefined) {
      lastActiveVerse.current = -1;
      return;
    }
    let v = 0;
    for (let i = 0; i < wordOffsets.length; i++) {
      if (wordOffsets[i] <= activeIndex) v = i;
      else break;
    }
    if (v === lastActiveVerse.current) return;
    lastActiveVerse.current = v;

    if (virtualized) {
      virtuosoRef.current?.scrollToIndex({ index: v, align: "center", behavior: "smooth" });
    } else {
      const el = verseEls.current[v];
      if (el && typeof window !== "undefined") {
        const rect = el.getBoundingClientRect();
        const mid = window.scrollY + rect.top + rect.height / 2;
        // 0.42 (vs 0.5 = exact centre) lifts it slightly so the next verse shows.
        window.scrollTo({ top: mid - window.innerHeight * 0.42, behavior: "smooth" });
      }
    }
  }, [activeIndex, wordOffsets, virtualized]);

  const renderVerse = (i: number) => (
    <VerseBlock
      ayah={ayat[i]}
      index={i}
      surahNumber={surahNumber}
      baseRefIndex={wordOffsets[i]}
      statuses={statuses}
      maddVerdicts={maddVerdicts}
      showTajweed={showTajweed}
      tajweedEveryWord={!virtualized}
      activeIndex={activeIndex}
      maskLevel={maskLevel}
      revealed={revealed}
      onReveal={reveal}
      bookmarks={bookmarks}
      showTranslation={showTranslation}
      showTranslit={showTranslit}
    />
  );

  // Short surahs (e.g. Al-Fatiha): render plainly — no need to virtualise.
  if (!virtualized) {
    return (
      <div className="mushaf px-5 py-6 sm:px-8 sm:py-8">
        {showHeader && <SurahHeader surahNumber={surahNumber} />}
        {ayat.map((a, i) => (
          <div
            key={a.number}
            ref={(el) => {
              verseEls.current[i] = el;
            }}
          >
            {renderVerse(i)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mushaf px-5 py-6 sm:px-8 sm:py-8">
      <Virtuoso
        ref={virtuosoRef}
        useWindowScroll
        totalCount={ayat.length}
        overscan={400}
        increaseViewportBy={250}
        components={showHeader ? { Header: () => <SurahHeader surahNumber={surahNumber} /> } : undefined}
        initialTopMostItemIndex={
          initialTopVerse && initialTopVerse > 1 ? { index: initialTopVerse - 1, align: "start" } : 0
        }
        rangeChanged={(r) => onTopVerseChange?.(ayat[r.startIndex]?.number ?? 1)}
        itemContent={(i) => renderVerse(i)}
      />
    </div>
  );
}
