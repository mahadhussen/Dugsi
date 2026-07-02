"use client";

import { useEffect, useState } from "react";
import { loadSurah, flattenAyat } from "@/lib/quran";
import { loadRecording } from "@/lib/recordings";
import { clipForMistake } from "@/lib/review";
import MistakeReview, { HearYourselfButton, type Mistake } from "./MistakeReview";
import type { StoredMistake } from "@/lib/supabase/progress";

/** Reviews the words you've previously got wrong in a surah: the qari for each,
 *  and — when this surah has been recited on this device — "You" to replay
 *  yourself at each mistake. When there's no recording, it says so explicitly
 *  instead of silently hiding buttons. */
export default function SurahMistakes({
  surahNumber,
  stored,
}: {
  surahNumber: number;
  stored: StoredMistake[];
}) {
  const [mistakes, setMistakes] = useState<Mistake[] | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | undefined>(undefined);
  const [hasRecording, setHasRecording] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;

    void Promise.all([loadSurah(surahNumber), loadRecording(surahNumber)]).then(([s, rec]) => {
      if (cancelled) return;
      const flat = flattenAyat(s.ayat);
      const times = rec?.times ?? {};
      setHasRecording(!!rec);
      if (rec) {
        url = URL.createObjectURL(rec.blob);
        setRecordingUrl(url);
      }
      const items: Mistake[] = stored
        .map((m): Mistake | null => {
          const fw = flat[m.i];
          return fw
            ? {
                refIndex: m.i,
                uthmani: fw.word.uthmani,
                translit: fw.word.translit,
                heard: m.h,
                verse: fw.ayah,
                skipped: m.h === null,
                time: clipForMistake(times, m.i, m.h === null),
              }
            : null;
        })
        .filter((x): x is Mistake => x !== null);
      setMistakes(items);
    });

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [surahNumber, stored]);

  if (!mistakes) {
    return <p className="px-1 py-3 text-xs text-ink/40">Loading…</p>;
  }
  if (mistakes.length === 0) {
    return (
      <p className="px-1 py-3 text-xs text-ink/50">
        No saved mistakes here yet — recite this surah and any slips will be saved to review.
      </p>
    );
  }
  return (
    <div>
      {hasRecording ? (
        <div className="flex justify-end pt-3">
          <HearYourselfButton recordingUrl={recordingUrl} />
        </div>
      ) : (
        <p className="px-1 pt-3 text-xs text-amber-700">
          No recording of this surah on <strong>this device</strong> yet — recite it once here and
          you&apos;ll be able to hear yourself at each mistake below.
        </p>
      )}
      <MistakeReview mistakes={mistakes} surahNumber={surahNumber} recordingUrl={recordingUrl} />
    </div>
  );
}
