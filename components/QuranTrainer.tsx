"use client";

import { useEffect, useMemo, useState } from "react";
import Reciter from "./Reciter";
import { SURAHS, surahMeta, loadSurah, type Surah } from "@/lib/quran";

export default function QuranTrainer() {
  const [surahId, setSurahId] = useState(1);
  const [surah, setSurah] = useState<Surah | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const meta = surahMeta(surahId)!;
  const pageSize = meta.pageSize;
  const totalPages = pageSize ? Math.ceil(meta.ayahCount / pageSize) : 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadSurah(surahId)
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
  }, [surahId]);

  const sectionAyat = useMemo(() => {
    if (!surah) return [];
    if (!pageSize) return surah.ayat;
    return surah.ayat.slice(page * pageSize, page * pageSize + pageSize);
  }, [surah, page, pageSize]);

  const selectSurah = (id: number) => {
    if (id === surahId) return;
    setSurahId(id);
    setPage(0);
    setSurah(null);
  };

  const from = page * (pageSize ?? meta.ayahCount) + 1;
  const to = Math.min(meta.ayahCount, from + (pageSize ?? meta.ayahCount) - 1);

  return (
    <div className="space-y-6">
      {/* Surah picker */}
      <div className="flex flex-wrap justify-center gap-2">
        {SURAHS.map((s) => (
          <button
            key={s.id}
            onClick={() => selectSurah(s.id)}
            className={`rounded-xl border px-4 py-2 text-left transition ${
              s.id === surahId
                ? "border-emerald bg-emerald text-white shadow-soft"
                : "border-gold/30 bg-white/70 text-ink hover:border-emerald/40"
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-semibold">{s.transliteration}</span>
              <span className="ayah text-lg" dir="rtl">
                {s.nameArabic}
              </span>
            </div>
            <div className={`text-xs ${s.id === surahId ? "text-white/70" : "text-ink/50"}`}>
              {s.ayahCount} {s.ayahCount === 1 ? "verse" : "verses"}
            </div>
          </button>
        ))}
      </div>

      {/* Section navigation (long surahs only) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-ink/5"
            aria-label="Previous verses"
          >
            ‹ Prev
          </button>
          <label className="text-sm text-ink/70">
            <span className="sr-only">Jump to verses</span>
            <select
              value={page}
              onChange={(e) => setPage(Number(e.target.value))}
              className="rounded-lg border border-gold/30 bg-white/80 px-2 py-1.5 text-sm"
            >
              {Array.from({ length: totalPages }, (_, i) => {
                const a = i * (pageSize ?? 0) + 1;
                const b = Math.min(meta.ayahCount, a + (pageSize ?? 0) - 1);
                return (
                  <option key={i} value={i}>
                    Verses {a}–{b}
                  </option>
                );
              })}
            </select>
          </label>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-ink/5"
            aria-label="Next verses"
          >
            Next ›
          </button>
        </div>
      )}

      <p className="text-center text-sm text-ink/60">
        Practising <span className="font-semibold text-ink">{meta.transliteration}</span>
        {totalPages > 1 ? `, verses ${from}–${to} of ${meta.ayahCount}` : ""}.
      </p>

      {loading || !surah ? (
        <div className="flex justify-center py-10 text-ink/60">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
        </div>
      ) : (
        <Reciter ayat={sectionAyat} />
      )}
    </div>
  );
}
