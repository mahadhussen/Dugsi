"use client";

import { surahMeta } from "@/lib/quran";
import { toggleVerse, usePlayingVerse, verseKey } from "@/lib/verse-player";

function toArabicNumeral(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/**
 * End-of-ayah marker: an eight-lobed rosette drawn in the page's ink, with the
 * verse number inside, like the printed mushaf. Tapping it plays the verse.
 */
export function AyahMarker({ surah, verse, size = 34 }: { surah: number; verse: number; size?: number }) {
  const playing = usePlayingVerse() === verseKey(surah, verse);
  // Eight scallops around a circle.
  const lobes: string[] = [];
  const R = 15;
  const r = 3.2;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    lobes.push(`${(20 + Math.cos(a) * R).toFixed(2)},${(20 + Math.sin(a) * R).toFixed(2)}`);
  }
  return (
    <button
      type="button"
      onClick={() => toggleVerse(surah, verse)}
      title={playing ? "Stop" : "Play this verse"}
      aria-label={`Verse ${verse}${playing ? ", playing" : ""}`}
      className={`ayah-marker mx-0.5 inline-grid place-items-center align-middle transition ${
        playing ? "text-emerald" : "text-paper-ink"
      }`}
      style={{ width: size, height: size, verticalAlign: "middle" }}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
        <circle cx="20" cy="20" r="15.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        {lobes.map((p, i) => {
          const [x, y] = p.split(",").map(Number);
          return <circle key={i} cx={x} cy={y} r={r} fill="rgb(var(--c-paper))" stroke="currentColor" strokeWidth="1.1" />;
        })}
        <circle cx="20" cy="20" r="12.3" fill="rgb(var(--c-paper))" stroke="currentColor" strokeWidth="0.9" />
        <text
          x="20"
          y="20"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-arabic)"
          fontSize={String(verse).length > 2 ? 11 : 13}
          fill="currentColor"
        >
          {toArabicNumeral(verse)}
        </text>
      </svg>
    </button>
  );
}

/** One side panel of the banner: a small arabesque, mirrored on the other side. */
function Arabesque({ flip = false }: { flip?: boolean }) {
  return (
    <g transform={flip ? "translate(400,0) scale(-1,1)" : undefined} fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M6 20c8-10 18-10 26 0s18 10 26 0" />
      <path d="M6 20c8 10 18 10 26 0s18-10 26 0" />
      <path d="M14 20c4-4 8-4 12 0M32 20c4 4 8 4 12 0" />
      <circle cx="19" cy="20" r="1.8" fill="currentColor" />
      <circle cx="45" cy="20" r="1.8" fill="currentColor" />
      <path d="M8 8c4 3 6 6 6 12M8 32c4-3 6-6 6-12" />
      <path d="M52 8c-4 3-6 6-6 12M52 32c-4-3-6-6-6-12" />
      <circle cx="70" cy="20" r="11" />
      <circle cx="70" cy="20" r="8.5" />
    </g>
  );
}

/**
 * The surah banner: a framed cartouche with the surah name, flanked by two
 * medallions and arabesque panels, in the page ink — as printed in the mushaf.
 */
export function SurahBanner({ surahNumber }: { surahNumber: number }) {
  const meta = surahMeta(surahNumber);
  if (!meta) return null;
  return (
    <div className="mx-auto my-2 w-full max-w-2xl text-paper-ink">
      <svg viewBox="0 0 400 40" className="block h-auto w-full" role="img" aria-label={`Surah ${meta.transliteration}`}>
        <rect x="1" y="1" width="398" height="38" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="4" y="4" width="392" height="32" rx="2" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <Arabesque />
        <Arabesque flip />
        {/* central cartouche with pointed ends */}
        <path
          d="M96 20c6-9 12-11 18-11h172c6 0 12 2 18 11c-6 9-12 11-18 11H114c-6 0-12-2-18-11z"
          fill="rgb(var(--c-paper))"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <text
          x="200"
          y="20.5"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-quran)"
          fontSize="22"
          fill="currentColor"
          direction="rtl"
        >
          {`سُورَةُ ${meta.nameArabic}`}
        </text>
      </svg>
    </div>
  );
}

/** The basmala as one calligraphic glyph (U+FDFD), where the mushaf prints it. */
export function Basmala() {
  return (
    <p className="basmala my-2 text-center" dir="rtl">
      ﷽
    </p>
  );
}
