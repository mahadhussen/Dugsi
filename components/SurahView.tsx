"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { Ayah, Surah } from "@/lib/quran/types";
import { loadSurah } from "@/lib/quran";
import { lastPageOf, loadPages, pageOf, surahsOnPages, isSegments, type Page } from "@/lib/quran/layout";
import { primaryRuleColor } from "@/lib/tajweed/rules";
import type { WordStatus } from "@/lib/align";
import { setReaderPosition } from "@/lib/reader-store";
import { isMaskedSlot } from "@/lib/hifz";
import { AyahMarker, SurahBanner, Basmala } from "./MushafOrnaments";
import { WordSpan } from "./WordSpan";
import MushafPage from "./MushafPage";

export { isMaskedSlot } from "@/lib/hifz";

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
  /** Translation / transliteration under each verse. With both off the text is
   *  shown as the printed mushaf pages. */
  showTranslation?: boolean;
  showTranslit?: boolean;
  /** Surah banner + basmala at the top (verse-block mode; the printed pages
   *  carry their own banners). */
  header?: boolean;
}

/** Verses per virtualised item in verse-block mode. */
const FLOW_CHUNK = 12;
const NO_COMPONENTS = {};

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
          // Memorisation: hide the word unless tapped open or recited correctly.
          const said = status === "correct" || status === "close";
          const masked = maskLevel > 0 && isMaskedSlot(idx, maskLevel) && !revealed?.has(idx) && !said;
          return (
            <WordSpan
              key={i}
              text={word.uthmani}
              translit={word.translit}
              masked={masked}
              onReveal={() => onReveal?.(idx)}
              colorClass={!hasFeedback && showTajweed ? primaryRuleColor(word.rules ?? []) : null}
              status={status}
              active={activeIndex === idx}
              madd={maddVerdicts?.[idx]}
            />
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
 * A run of verses. Without translation they share one justified paragraph
 * (the fallback when the printed layout is unavailable); with translation on,
 * each verse gets its own block with the translation beneath.
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

/** The printed pages that carry the verses being shown. */
interface Book {
  ayat: Ayah[];
  first: number;
  pages: Page[];
  texts: Map<number, Surah>;
}

/** Placeholder with the shape of a page while its layout loads. */
function PageSkeleton() {
  return (
    <div className="mushaf px-3 py-4 sm:px-8 sm:py-7" aria-busy="true">
      <div className="mpage">
        {Array.from({ length: 15 }, (_, i) => (
          <div key={i} className="mline">
            <span className="mskel" />
          </div>
        ))}
      </div>
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
  const ayahIndex = useMemo(() => {
    const m = new Map<number, number>();
    ayat.forEach((a, i) => m.set(a.number, i));
    return m;
  }, [ayat]);
  // Global word index of a word of this surah, or undefined outside the shown verses.
  const refIndex = useCallback(
    (ayah: number, word: number): number | undefined => {
      const i = ayahIndex.get(ayah);
      if (i === undefined || word < 0 || word >= ayat[i].words.length) return undefined;
      return wordOffsets[i] + word;
    },
    [ayahIndex, wordOffsets, ayat],
  );

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

  // Page mode: the printed mushaf pages, unless translation/transliteration
  // is on (then one block per verse). Falls back to flowing text if the
  // layout cannot be loaded.
  const flowing = !showTranslation && !showTranslit;
  const [book, setBook] = useState<Book | null>(null);
  const [bookFailed, setBookFailed] = useState(false);
  useEffect(() => {
    if (!flowing || ayat.length === 0) return;
    let cancelled = false;
    const first = pageOf(surahNumber, ayat[0].number);
    const last = lastPageOf(surahNumber, ayat[ayat.length - 1].number);
    (async () => {
      const pages = await loadPages(first, last);
      const ids = surahsOnPages(pages);
      const loaded = await Promise.all(ids.map((id) => loadSurah(id)));
      if (cancelled) return;
      setBook({ ayat, first, pages, texts: new Map(ids.map((id, i) => [id, loaded[i]])) });
      setBookFailed(false);
    })().catch(() => {
      if (!cancelled) setBookFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [flowing, surahNumber, ayat]);
  const pageMode = flowing && !bookFailed;
  const ready = book !== null && book.ayat === ayat;

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const lastActiveVerse = useRef(-1);
  const virtualized = pageMode ? (book?.pages.length ?? 0) > 3 : ayat.length > 20;
  const showHeader = !pageMode && header && ayat.length > 0 && ayat[0].number === 1;
  // Al-Fatiha's first verse *is* the basmala; At-Tawbah has none.
  const basmala = showHeader && surahNumber !== 1 && surahNumber !== 9;

  // Virtualised items: printed pages, or runs of verses (verse-block mode).
  const chunks = useMemo(() => {
    const out: { from: number; to: number }[] = [];
    const size = ayat.length > 20 ? FLOW_CHUNK : Math.max(1, ayat.length);
    for (let i = 0; i < ayat.length; i += size) out.push({ from: i, to: Math.min(ayat.length, i + size) });
    return out;
  }, [ayat]);
  const itemCount = pageMode ? (book?.pages.length ?? 0) : chunks.length;
  const itemOfVerse = (verseIdx: number) =>
    pageMode && book
      ? pageOf(surahNumber, ayat[verseIdx]?.number ?? 1) - book.first
      : Math.floor(verseIdx / (ayat.length > 20 ? FLOW_CHUNK : Math.max(1, ayat.length)));
  const firstVerseOfItem = (i: number): number => {
    if (pageMode && book) {
      for (const line of book.pages[i] ?? []) {
        if (!isSegments(line)) continue;
        for (const [s, a] of line) if (s === surahNumber && ayahIndex.has(a)) return a;
      }
      return ayat[0]?.number ?? 1;
    }
    return ayat[chunks[i]?.from ?? 0]?.number ?? 1;
  };

  // Tell the top bar where we are: the first verse still visible under the
  // header as the page scrolls (throttled), and the verse being recited.
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;
  useEffect(() => {
    if (ayat.length > 0) setReaderPosition(surahNumber, ayat[0].number, pageOf(surahNumber, ayat[0].number));
    if (typeof window === "undefined") return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (activeRef.current !== undefined) return; // reciting: the active verse wins
      const els = document.querySelectorAll<HTMLElement>("[data-verse]");
      const top = 64; // below the sticky header
      let best: number | null = null;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.bottom >= top) {
          best = Number(el.dataset.verse);
          break;
        }
      }
      if (best !== null) setReaderPosition(surahNumber, best, pageOf(surahNumber, best));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
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
    const verse = ayat[v]?.number ?? 1;
    setReaderPosition(surahNumber, verse, pageOf(surahNumber, verse));

    if (typeof document === "undefined") return;
    const el = document.querySelector<HTMLElement>(`[data-verse="${verse}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      const mid = window.scrollY + rect.top + rect.height / 2;
      window.scrollTo({ top: mid - window.innerHeight * 0.42, behavior: "smooth" });
    } else if (virtualized) {
      virtuosoRef.current?.scrollToIndex({ index: itemOfVerse(v), align: "center", behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, wordOffsets, virtualized, ready]);

  const renderItem = (i: number) =>
    pageMode && book ? (
      <MushafPage
        page={book.first + i}
        lines={book.pages[i]}
        texts={book.texts}
        surahNumber={surahNumber}
        refIndex={refIndex}
        statuses={statuses}
        maddVerdicts={maddVerdicts}
        showTajweed={showTajweed}
        activeIndex={activeIndex}
        maskLevel={maskLevel}
        revealed={revealed}
        onReveal={reveal}
      />
    ) : (
      <FlowBlock
        ayat={ayat}
        offsets={wordOffsets}
        from={chunks[i].from}
        to={chunks[i].to}
        surahNumber={surahNumber}
        statuses={statuses}
        maddVerdicts={maddVerdicts}
        showTajweed={showTajweed}
        tajweedEveryWord={ayat.length <= 20}
        activeIndex={activeIndex}
        maskLevel={maskLevel}
        revealed={revealed}
        onReveal={reveal}
        showTranslation={showTranslation}
        showTranslit={showTranslit}
      />
    );

  // Stable component identity so Virtuoso doesn't remount the banner each render.
  const Header = useMemo(() => {
    const H = () => (
      <>
        {showHeader && <SurahBanner surahNumber={surahNumber} />}
        {basmala && <Basmala />}
      </>
    );
    return H;
  }, [showHeader, basmala, surahNumber]);

  if (pageMode && !ready) return <PageSkeleton />;

  // A few pages or a short surah: render plainly — no need to virtualise.
  if (!virtualized) {
    return (
      <div className="mushaf px-3 py-4 sm:px-8 sm:py-7">
        <Header />
        {Array.from({ length: itemCount }, (_, i) => (
          <div key={i}>{renderItem(i)}</div>
        ))}
      </div>
    );
  }

  const startVerseIdx = initialTopVerse && initialTopVerse > 1 ? (ayahIndex.get(initialTopVerse) ?? 0) : 0;
  return (
    <div className="mushaf px-3 py-4 sm:px-8 sm:py-7">
      <Virtuoso
        ref={virtuosoRef}
        useWindowScroll
        totalCount={itemCount}
        overscan={600}
        increaseViewportBy={300}
        components={pageMode ? NO_COMPONENTS : { Header }}
        initialTopMostItemIndex={startVerseIdx > 0 ? { index: itemOfVerse(startVerseIdx), align: "start" } : 0}
        rangeChanged={(r) => {
          const verse = firstVerseOfItem(r.startIndex);
          onTopVerseChange?.(verse);
          if (activeIndex === undefined) setReaderPosition(surahNumber, verse, pageOf(surahNumber, verse));
        }}
        itemContent={(i) => renderItem(i)}
      />
    </div>
  );
}
