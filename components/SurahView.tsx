import type { Ayah } from "@/lib/quran/types";
import { primaryRuleColor } from "@/lib/tajweed/rules";
import type { WordStatus } from "@/lib/align";

interface Props {
  /** The ayat to render (one practice section). */
  ayat: Ayah[];
  /** refIndex -> recitation status, when feedback is available. */
  statuses?: Record<number, WordStatus>;
  /** refIndex -> madd timing verdict, when available. */
  maddVerdicts?: Record<number, "good" | "rushed" | "unknown">;
  /** Show tajweed colours (off while showing recitation results for clarity). */
  showTajweed?: boolean;
  /** The next expected word while reciting live — gets a cursor + auto-scroll. */
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

export default function SurahView({
  ayat,
  statuses,
  maddVerdicts,
  showTajweed = true,
  activeIndex,
}: Props) {
  let refIndex = -1;
  const hasFeedback = !!statuses;

  return (
    <div className="divide-y divide-gold/15">
      {ayat.map((ayah) => (
        <div key={ayah.number} data-verse={ayah.number} className="ayah-block py-5 first:pt-0 last:pb-0">
          <p className="ayah text-3xl sm:text-[2.1rem]">
            {ayah.words.map((word, i) => {
              refIndex++;
              const idx = refIndex;
              const status = statuses?.[idx];
              const madd = maddVerdicts?.[idx];

              const colorClass =
                !hasFeedback && showTajweed ? primaryRuleColor(word.rules ?? []) : null;
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
      ))}
    </div>
  );
}
