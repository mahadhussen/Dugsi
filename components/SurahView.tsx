import { memo } from "react";
import type { Ayah } from "@/lib/quran/types";
import { primaryRuleColor } from "@/lib/tajweed/rules";
import type { WordStatus } from "@/lib/align";

interface Props {
  /** The ayat to render (one practice section / whole surah). */
  ayat: Ayah[];
  /** refIndex -> recitation status, when feedback is available. */
  statuses?: Record<number, WordStatus>;
  /** refIndex -> madd timing verdict, when available. */
  maddVerdicts?: Record<number, "good" | "rushed" | "unknown">;
  /** Show tajweed colours (off while showing recitation results for clarity). */
  showTajweed?: boolean;
  /** The next expected word while reciting live — gets a cursor. */
  activeIndex?: number;
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
  /** Global index of this verse's first word. */
  baseRefIndex: number;
  statuses?: Record<number, WordStatus>;
  maddVerdicts?: Record<number, "good" | "rushed" | "unknown">;
  showTajweed: boolean;
  activeIndex?: number;
}

// Each verse only re-renders when its own words' status, its madd marks, the
// active cursor entering/leaving it, or the tajweed toggle change. Without this,
// every live speech update would re-render all ~6118 words of Al-Baqarah and
// crash mobile browsers.
const VerseBlock = memo(function VerseBlock({
  ayah,
  baseRefIndex,
  statuses,
  maddVerdicts,
  showTajweed,
  activeIndex,
}: VerseProps) {
  const hasFeedback = !!statuses;
  return (
    <div data-verse={ayah.number} className="ayah-block py-5 first:pt-0 last:pb-0">
      <p className="ayah text-3xl sm:text-[2.1rem]">
        {ayah.words.map((word, i) => {
          const idx = baseRefIndex + i;
          const status = statuses?.[idx];
          const madd = maddVerdicts?.[idx];
          const colorClass = !hasFeedback && showTajweed ? primaryRuleColor(word.rules ?? []) : null;
          const statusBg = status ? statusClass[status] : "";
          const active = activeIndex === idx ? "word-active" : "";
          return (
            <span
              key={i}
              data-ref={idx}
              className={`word ${colorClass ?? ""} ${statusBg} ${active}`}
              title={word.translit}
            >
              {word.uthmani}
              {madd === "rushed" && (
                <sup className="ml-0.5 text-xs text-red-600" title="Elongation may be rushed">
                  ⏱
                </sup>
              )}{" "}
            </span>
          );
        })}
        <span className="ayah-medallion mx-1 align-middle">{toArabicNumeral(ayah.number)}</span>
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
  if (prev.ayah !== next.ayah || prev.baseRefIndex !== next.baseRefIndex) return false;

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
  return true; // unchanged — skip re-render
}

export default function SurahView({ ayat, statuses, maddVerdicts, showTajweed = true, activeIndex }: Props) {
  // Global word offset for the first word of each verse.
  const offsets: number[] = [];
  let acc = 0;
  for (const a of ayat) {
    offsets.push(acc);
    acc += a.words.length;
  }

  return (
    <div className="divide-y divide-gold/15">
      {ayat.map((ayah, i) => (
        <VerseBlock
          key={ayah.number}
          ayah={ayah}
          baseRefIndex={offsets[i]}
          statuses={statuses}
          maddVerdicts={maddVerdicts}
          showTajweed={showTajweed}
          activeIndex={activeIndex}
        />
      ))}
    </div>
  );
}
