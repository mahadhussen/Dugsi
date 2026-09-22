"use client";

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import type { Surah } from "@/lib/quran/types";
import { isSegments, type Page } from "@/lib/quran/layout";
import type { WordStatus } from "@/lib/align";
import { primaryRuleColor } from "@/lib/tajweed/rules";
import { isMaskedSlot } from "@/lib/hifz";
import { AyahMarker, SurahBanner, Basmala } from "./MushafOrnaments";
import { WordSpan } from "./WordSpan";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface MushafPageProps {
  page: number;
  lines: Page;
  /** Text of every surah that appears on the page. */
  texts: Map<number, Surah>;
  /** The surah being read or recited; other surahs on the page are dimmed. */
  surahNumber: number;
  /** Global word index for a word of the current surah, or undefined when the
   *  word is outside the verses being practised. */
  refIndex: (ayah: number, word: number) => number | undefined;
  statuses?: Record<number, WordStatus>;
  maddVerdicts?: Record<number, "good" | "rushed" | "unknown">;
  showTajweed: boolean;
  activeIndex?: number;
  maskLevel: number;
  revealed?: Set<number>;
  onReveal?: (refIndex: number) => void;
}

/**
 * One page of the printed mushaf: 15 lines (8 on the first two pages), every
 * word on the line the Complex printed it on. Lines are spread to the page
 * edges like the printed text; a surah's last line and the framed first pages
 * are centred. Words are scaled so the widest line always fits the page.
 */
function MushafPageInner(p: MushafPageProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Fit-to-width: the widest line decides the page's font scale.
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const fit = () => {
      raf = 0;
      const cur = Number(el.style.getPropertyValue("--mscale") || 1) || 1;
      let need = 1;
      for (const line of el.querySelectorAll<HTMLElement>(".mline-t")) {
        const avail = line.clientWidth;
        if (!avail) continue;
        let natural = 0;
        for (const c of line.querySelectorAll<HTMLElement>(".word, .ayah-marker")) natural += c.getBoundingClientRect().width;
        if (line.classList.contains("mline-c")) natural += 0.3 * parseFloat(getComputedStyle(line).fontSize) * Math.max(0, line.querySelectorAll(".word, .ayah-marker").length - 1);
        const ratio = natural / cur / avail;
        if (ratio > need) need = ratio;
      }
      const scale = Math.min(1, 0.985 / need);
      if (Math.abs(scale - cur) > 0.005) el.style.setProperty("--mscale", scale.toFixed(3));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(fit);
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(el);
    document.fonts?.ready.then(schedule).catch(() => {});
    schedule();
    return () => {
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [p.lines, p.maskLevel, p.showTajweed]);

  const hasFeedback = !!p.statuses;
  const own = (ayah: number, word: number) => p.refIndex(ayah, word) !== undefined;

  return (
    <div ref={ref} className="mpage" data-page={p.page}>
      {p.lines.map((line, li) => {
        if (!isSegments(line)) {
          return line[0] === "h" ? (
            <div key={li} className="mline mline-h">
              <SurahBanner surahNumber={line[1]} />
            </div>
          ) : (
            <div key={li} className="mline mline-b">
              <Basmala />
            </div>
          );
        }
        // Centre the framed first pages and a surah's closing line.
        const centred =
          p.page <= 2 || line.some(([s, a, , , m]) => m === 1 && a === (p.texts.get(s)?.ayat.length ?? -1));
        let verse: number | undefined;
        for (const [s, a, w0, w1] of line) {
          if (s === p.surahNumber && own(a, w0 < w1 ? w0 : 0)) {
            verse = a;
            break;
          }
        }
        return (
          <div key={li} className={`mline mline-t ${centred ? "mline-c" : ""}`} data-verse={verse}>
            {line.map(([s, a, w0, w1, m]) => {
              const ayah = p.texts.get(s)?.ayat[a - 1];
              if (!ayah) return null;
              const nodes = [];
              for (let w = w0; w < w1; w++) {
                const word = ayah.words[w];
                if (!word) continue;
                const idx = s === p.surahNumber ? p.refIndex(a, w) : undefined;
                if (idx === undefined) {
                  nodes.push(
                    <span key={w} className="word word-far">
                      {word.uthmani}
                    </span>,
                  );
                  continue;
                }
                const status = p.statuses?.[idx];
                const said = status === "correct" || status === "close";
                const masked = p.maskLevel > 0 && isMaskedSlot(idx, p.maskLevel) && !p.revealed?.has(idx) && !said;
                nodes.push(
                  <WordSpan
                    key={w}
                    text={word.uthmani}
                    translit={word.translit}
                    masked={masked}
                    onReveal={() => p.onReveal?.(idx)}
                    colorClass={!hasFeedback && p.showTajweed ? primaryRuleColor(word.rules ?? []) : null}
                    status={status}
                    active={p.activeIndex === idx}
                    madd={p.maddVerdicts?.[idx]}
                    space={false}
                  />,
                );
              }
              if (m) nodes.push(<AyahMarker key="m" surah={s} verse={a} />);
              return <span key={`${s}:${a}:${w0}`} className="contents">{nodes}</span>;
            })}
          </div>
        );
      })}
      <div className="mpage-num">{p.page}</div>
    </div>
  );
}

/** Re-render a page only when something on *this* page changed. */
function pageEqual(prev: MushafPageProps, next: MushafPageProps): boolean {
  if (
    prev.page !== next.page ||
    prev.lines !== next.lines ||
    prev.texts !== next.texts ||
    prev.surahNumber !== next.surahNumber ||
    prev.refIndex !== next.refIndex ||
    prev.showTajweed !== next.showTajweed ||
    prev.maskLevel !== next.maskLevel ||
    prev.onReveal !== next.onReveal ||
    !!prev.statuses !== !!next.statuses ||
    !!prev.maddVerdicts !== !!next.maddVerdicts
  )
    return false;
  // Indexes of this page's own words.
  let lo = Number.MAX_SAFE_INTEGER;
  let hi = -1;
  for (const line of next.lines) {
    if (!isSegments(line)) continue;
    for (const [s, a, w0, w1] of line) {
      if (s !== next.surahNumber || w1 <= w0) continue;
      const first = next.refIndex(a, w0);
      const last = next.refIndex(a, w1 - 1);
      if (first !== undefined && first < lo) lo = first;
      if (last !== undefined && last > hi) hi = last;
    }
  }
  if (hi < lo) return true; // nothing of the current surah on this page
  const inRange = (i: number | undefined) => i !== undefined && i >= lo && i <= hi;
  if ((inRange(prev.activeIndex) || inRange(next.activeIndex)) && prev.activeIndex !== next.activeIndex) return false;
  for (let i = lo; i <= hi; i++) {
    if (prev.statuses?.[i] !== next.statuses?.[i]) return false;
    if (prev.maddVerdicts?.[i] !== next.maddVerdicts?.[i]) return false;
    if (next.maskLevel > 0 && (prev.revealed?.has(i) ?? false) !== (next.revealed?.has(i) ?? false)) return false;
  }
  return true;
}

const MushafPage = memo(MushafPageInner, pageEqual);
export default MushafPage;
