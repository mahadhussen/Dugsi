"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { Ayah } from "@/lib/quran/types";
import { primaryRuleColor } from "@/lib/tajweed/rules";
import type { WordStatus } from "@/lib/align";
import { setReaderPosition } from "@/lib/reader-store";
import { AyahMarker, SurahBanner, Basmala } from "./MushafOrnaments";

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
  /** Kept for callers; bookmarking now lives in the top bar. */
  bookmarks?: boolean;
  /** Translation / transliteration under each verse. With both off the text
   *  flows continuously like a printed page. */
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

/** Verses per virtualised item in flowing mode. */
const FLOW_CHUNK = 8;

interface WordsProps {
  ayah: Ayah;
  surahNumber: number;
  baseRefIndex: number;
  statuses?: Record<number, WordStatus>;
  maddVerdicts?: Record<number, "good" | "rushed" | "unknown">;
  showTajweed: boolean;
  tajweedEveryWord: boolean;
  activeIndex?: number;
  maskLevel: number;
  revealed?: Set<number>;
  onReveal?: (refIndex: number) => void;
}

/** The words of one verse plus its marker, inline (no block of its own). */
function VerseWords({
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
}: WordsProps) {
  const hasFeedback = !!statuses;
  const len = ayah.words.length;

  // Render per-word spans only when a verse needs them (recited / has marks /
  // tajweed-coloured / memorisation masking); otherwise a single text node.
  let needWords =
    maskLevel > 0 || (activeIndex !== undefined && activeIndex >= baseRefIndex && activeIndex < baseRefIndex + len);
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

  return (
    <>
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
                <sup className="ml-0.5 text-xs" style={{ color: "var(--bad)" }} title="Elongation may be rushed">
                  ⏱
                </sup>
              )}{" "}
            </span>
          );
        })
      ) : (
        <span>{ayah.words.map((w) => w.uthmani).join(" ")} </span>
      )}
      <AyahMarker surah={surahNumber} verse={ayah.number} />{" "}
    </>
  );
}

interface FlowProps {
  ayat: Ayah[];
  offsets: number[];
  from: number;
  to: number; // exclusive
  surahNumber: number;
  statuses?: Record<number, WordStatus>;
  maddVerdicts?: Record<number, "good" | "rushed" | "unknown">;
  showTajweed: boolean;
  tajweedEveryWord: boolean;
  activeIndex?: number;
  maskLevel: number;
  revealed?: Set<number>;
  onReveal?: (refIndex: number) => void;
  showTranslation: boolean;
  showTranslit: boolean;
}

/**
 * A run of verses. In flowing mode they share one justified paragraph, like
 * the printed page; with translation on, each verse gets its own block with
 * the translation beneath.
 */
const FlowBlock = memo(function FlowBlock(p: FlowProps) {
  const flowing = !p.showTranslation && !p.showTranslit;
  const verses = [];
  for (let i = p.from; i < p.to; i++) verses.push(i);
  const words = (i: number) => (
    <VerseWords
      ayah={p.ayat[i]}
      surahNumber={p.surahNumber}
      baseRefIndex={p.offsets[i]}
      statuses={p.statuses}
      maddVerdicts={p.maddVerdicts}
      showTajweed={p.showTajweed}
      tajweedEveryWord={p.tajweedEveryWord}
      activeIndex={p.activeIndex}
      maskLevel={p.maskLevel}
      revealed={p.revealed}
      onReveal={p.onReveal}
    />
  );
  if (flowing) {
    return (
      <p className="ayah">
        {verses.map((i) => (
          <span key={p.ayat[i].number} data-verse={p.ayat[i].number}>
            {words(i)}
          </span>
        ))}
      </p>
    );
  }
  return (
    <div>
      {verses.map((i) => {
        const a = p.ayat[i];
        const translit = p.showTranslit && p.maskLevel === 0 ? a.translit : undefined;
        const translation = p.showTranslation && p.maskLevel < 2 ? a.translation : undefined;
        return (
          <div key={a.number} data-verse={a.number} className="border-b border-paper-ink/8 py-2 last:border-0">
            <p className="ayah">{words(i)}</p>
            {translit && (
              <p className="mt-1 text-sm italic text-paper-ink/60" dir="ltr">
                {translit}
              </p>
            )}
            {translation && (
              <p className="mt-1 text-[13px] leading-relaxed text-paper-ink/70" dir="ltr">
                <span className="mr-1 text-[10px] font-semibold text-paper-ink/50">{a.number}</span>
                {translation}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}, flowEqual);

function flowEqual(prev: FlowProps, next: FlowProps): boolean {
  if (prev.ayat !== next.ayat || prev.from !== next.from || prev.to !== next.to) return false;
  if (prev.showTajweed !== next.showTajweed || prev.tajweedEveryWord !== next.tajweedEveryWord) return false;
  if (prev.maskLevel !== next.maskLevel) return false;
  if (prev.showTranslation !== next.showTranslation || prev.showTranslit !== next.showTranslit) return false;
  const base = next.offsets[next.from];
  const end = next.to < next.offsets.length ? next.offsets[next.to] : Number.MAX_SAFE_INTEGER;
  const prevActiveHere = prev.activeIndex !== undefined && prev.activeIndex >= base && prev.activeIndex < end;
  const nextActiveHere = next.activeIndex !== undefined && next.activeIndex >= base && next.activeIndex < end;
  if ((prevActiveHere || nextActiveHere) && prev.activeIndex !== next.activeIndex) return false;
  const last = next.to < next.offsets.length ? next.offsets[next.to] : base + countWords(next.ayat, next.from, next.to);
  for (let idx = base; idx < last; idx++) {
    if (prev.statuses?.[idx] !== next.statuses?.[idx]) return false;
    if (prev.maddVerdicts?.[idx] !== next.maddVerdicts?.[idx]) return false;
    if (next.maskLevel > 0 && (prev.revealed?.has(idx) ?? false) !== (next.revealed?.has(idx) ?? false)) return false;
  }
  return true;
}

function countWords(ayat: Ayah[], from: number, to: number): number {
  let n = 0;
  for (let i = from; i < to; i++) n += ayat[i].words.length;
  return n;
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
  showTranslation = false,
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
  const chunkEls = useRef<(HTMLDivElement | null)[]>([]);
  const lastActiveVerse = useRef(-1);
  const virtualized = ayat.length > 20;
  const showHeader = header && ayat.length > 0 && ayat[0].number === 1;
  // Al-Fatiha's first verse *is* the basmala; At-Tawbah has none.
  const basmala = showHeader && surahNumber !== 1 && surahNumber !== 9;

  // Virtualised items are runs of verses; short surahs are one run.
  const chunks = useMemo(() => {
    const out: { from: number; to: number }[] = [];
    const size = virtualized ? FLOW_CHUNK : ayat.length;
    for (let i = 0; i < ayat.length; i += size) out.push({ from: i, to: Math.min(ayat.length, i + size) });
    return out;
  }, [ayat, virtualized]);
  const chunkOf = (verseIndex: number) => Math.floor(verseIndex / (virtualized ? FLOW_CHUNK : Math.max(1, ayat.length)));

  // Tell the top bar where we are.
  useEffect(() => {
    if (ayat.length > 0) setReaderPosition(surahNumber, ayat[0].number);
  }, [surahNumber, ayat]);

  // Follow the reciter, book-style: keep the verse being recited in view.
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
    setReaderPosition(surahNumber, ayat[v]?.number ?? 1);

    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>(`[data-verse="${ayat[v]?.number}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      const mid = window.scrollY + rect.top + rect.height / 2;
      window.scrollTo({ top: mid - window.innerHeight * 0.42, behavior: "smooth" });
    } else if (virtualized) {
      virtuosoRef.current?.scrollToIndex({ index: chunkOf(v), align: "center", behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, wordOffsets, virtualized]);

  const renderChunk = (c: number) => (
    <FlowBlock
      ayat={ayat}
      offsets={wordOffsets}
      from={chunks[c].from}
      to={chunks[c].to}
      surahNumber={surahNumber}
      statuses={statuses}
      maddVerdicts={maddVerdicts}
      showTajweed={showTajweed}
      tajweedEveryWord={!virtualized}
      activeIndex={activeIndex}
      maskLevel={maskLevel}
      revealed={revealed}
      onReveal={reveal}
      showTranslation={showTranslation}
      showTranslit={showTranslit}
    />
  );

  const Header = () => (
    <>
      {showHeader && <SurahBanner surahNumber={surahNumber} />}
      {basmala && <Basmala />}
    </>
  );

  // Short surahs (e.g. Al-Fatiha): render plainly — no need to virtualise.
  if (!virtualized) {
    return (
      <div className="mushaf px-4 py-5 sm:px-8 sm:py-7">
        <Header />
        {chunks.map((_, c) => (
          <div
            key={c}
            ref={(el) => {
              chunkEls.current[c] = el;
            }}
          >
            {renderChunk(c)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mushaf px-4 py-5 sm:px-8 sm:py-7">
      <Virtuoso
        ref={virtuosoRef}
        useWindowScroll
        totalCount={chunks.length}
        overscan={600}
        increaseViewportBy={300}
        components={{ Header }}
        initialTopMostItemIndex={
          initialTopVerse && initialTopVerse > 1 ? { index: chunkOf(initialTopVerse - 1), align: "start" } : 0
        }
        rangeChanged={(r) => {
          const verse = ayat[chunks[r.startIndex]?.from ?? 0]?.number ?? 1;
          onTopVerseChange?.(verse);
          if (activeIndex === undefined) setReaderPosition(surahNumber, verse);
        }}
        itemContent={(c) => renderChunk(c)}
      />
    </div>
  );
}
