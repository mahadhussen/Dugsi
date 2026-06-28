"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { Ayah } from "@/lib/quran/types";
import { primaryRuleColor } from "@/lib/tajweed/rules";
import type { WordStatus } from "@/lib/align";
import PlayButton from "./PlayButton";

interface Props {
  ayat: Ayah[];
  /** Surah number, for the per-verse reciter audio. */
  surahNumber: number;
  statuses?: Record<number, WordStatus>;
  maddVerdicts?: Record<number, "good" | "rushed" | "unknown">;
  showTajweed?: boolean;
  /** The next expected word while reciting live — gets a cursor + auto-follow. */
  activeIndex?: number;
  /** 1-based verse to start at (resume). */
  initialTopVerse?: number;
  /** Reports the 1-based verse nearest the top as the reader scrolls. */
  onTopVerseChange?: (verse: number) => void;
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
  activeIndex?: number;
}

const VerseBlock = memo(function VerseBlock({
  ayah,
  index,
  surahNumber,
  baseRefIndex,
  statuses,
  maddVerdicts,
  showTajweed,
  activeIndex,
}: VerseProps) {
  const hasFeedback = !!statuses;
  const len = ayah.words.length;

  // Render per-word spans only when a verse needs them (recited / has marks /
  // tajweed-coloured); otherwise a single text node — far lighter.
  let needWords =
    activeIndex !== undefined && activeIndex >= baseRefIndex && activeIndex < baseRefIndex + len;
  if (!needWords) {
    for (let i = 0; i < len; i++) {
      const idx = baseRefIndex + i;
      if (statuses?.[idx] || maddVerdicts?.[idx]) {
        needWords = true;
        break;
      }
      if (!hasFeedback && showTajweed && (ayah.words[i].rules?.length ?? 0) > 0) {
        needWords = true;
        break;
      }
    }
  }

  return (
    <div className={`ayah-block py-5 ${index > 0 ? "border-t border-gold/15" : ""}`}>
      <p className="ayah text-3xl sm:text-[2.1rem]">
        {needWords ? (
          ayah.words.map((word, i) => {
            const idx = baseRefIndex + i;
            const status = statuses?.[idx];
            const madd = maddVerdicts?.[idx];
            const colorClass =
              !hasFeedback && showTajweed ? primaryRuleColor(word.rules ?? []) : null;
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
        <span className="ayah-medallion mx-1 align-middle">{toArabicNumeral(ayah.number)}</span>
        <PlayButton surah={surahNumber} ayah={ayah.number} />
      </p>
      {ayah.translit && (
        <p className="mt-2 text-sm italic text-emerald/80" dir="ltr">
          {ayah.translit}
        </p>
      )}
      {ayah.translation && (
        <p className="text-sm text-ink/60" dir="ltr">
          {ayah.translation}
        </p>
      )}
    </div>
  );
}, versesEqual);

function versesEqual(prev: VerseProps, next: VerseProps): boolean {
  if (prev.showTajweed !== next.showTajweed) return false;
  if (prev.ayah !== next.ayah || prev.baseRefIndex !== next.baseRefIndex || prev.index !== next.index)
    return false;

  const base = next.baseRefIndex;
  const len = next.ayah.words.length;
  const prevActiveHere =
    prev.activeIndex !== undefined && prev.activeIndex >= base && prev.activeIndex < base + len;
  const nextActiveHere =
    next.activeIndex !== undefined && next.activeIndex >= base && next.activeIndex < base + len;
  if ((prevActiveHere || nextActiveHere) && prev.activeIndex !== next.activeIndex) return false;

  for (let i = 0; i < len; i++) {
    const idx = base + i;
    if (prev.statuses?.[idx] !== next.statuses?.[idx]) return false;
    if (prev.maddVerdicts?.[idx] !== next.maddVerdicts?.[idx]) return false;
  }
  return true;
}

export default function SurahView({
  ayat,
  surahNumber,
  statuses,
  maddVerdicts,
  showTajweed = true,
  activeIndex,
  initialTopVerse,
  onTopVerseChange,
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

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const lastActiveVerse = useRef(-1);

  // Follow the reciter: scroll to the verse holding the active word as it moves.
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
    if (v !== lastActiveVerse.current) {
      lastActiveVerse.current = v;
      virtuosoRef.current?.scrollToIndex({ index: v, align: "center", behavior: "smooth" });
    }
  }, [activeIndex, wordOffsets]);

  const renderVerse = (i: number) => (
    <VerseBlock
      ayah={ayat[i]}
      index={i}
      surahNumber={surahNumber}
      baseRefIndex={wordOffsets[i]}
      statuses={statuses}
      maddVerdicts={maddVerdicts}
      showTajweed={showTajweed}
      activeIndex={activeIndex}
    />
  );

  // Short surahs (e.g. Al-Fatiha): render plainly — no need to virtualise.
  if (ayat.length <= 20) {
    return <div>{ayat.map((a, i) => <div key={a.number}>{renderVerse(i)}</div>)}</div>;
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      useWindowScroll
      totalCount={ayat.length}
      overscan={800}
      increaseViewportBy={400}
      initialTopMostItemIndex={
        initialTopVerse && initialTopVerse > 1
          ? { index: initialTopVerse - 1, align: "start" }
          : 0
      }
      rangeChanged={(r) => onTopVerseChange?.(ayat[r.startIndex]?.number ?? 1)}
      itemContent={(i) => renderVerse(i)}
    />
  );
}
