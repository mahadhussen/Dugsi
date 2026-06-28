"use client";

import { useMemo, useState } from "react";
import { SURAHS } from "@/lib/quran";

export default function SurahPicker({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const cur = SURAHS.find((s) => s.id === current) ?? SURAHS[0];

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return SURAHS;
    return SURAHS.filter(
      (s) =>
        s.transliteration.toLowerCase().includes(t) ||
        String(s.id) === t ||
        s.nameArabic.includes(query.trim()),
    );
  }, [query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-white/80 px-4 py-3 text-left shadow-soft transition hover:border-emerald/40"
      >
        <span>
          <span className="text-xs text-ink/50">Surah {cur.id} · {cur.ayahCount} verses</span>
          <span className="block text-lg font-semibold text-ink">{cur.transliteration}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="ayah text-2xl text-emerald" dir="rtl">
            {cur.nameArabic}
          </span>
          <span className="text-ink/40">▾</span>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={close}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-parchment shadow-soft sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-gold/20 p-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search surah (name or number)…"
                autoFocus
                className="w-full rounded-lg border border-gold/30 bg-white px-3 py-2 text-sm outline-none focus:border-emerald"
              />
              <button onClick={close} className="px-2 text-sm text-ink/60 hover:text-ink">
                Close
              </button>
            </div>
            <ul className="overflow-y-auto">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => {
                      onSelect(s.id);
                      close();
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-emerald/5 ${
                      s.id === current ? "bg-emerald/10" : ""
                    }`}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold/15 text-xs font-semibold text-gold-deep">
                      {s.id}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {s.transliteration}
                      </span>
                      <span className="text-xs text-ink/45">{s.ayahCount} verses</span>
                    </span>
                    <span className="ayah text-xl text-emerald" dir="rtl">
                      {s.nameArabic}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="p-4 text-center text-sm text-ink/50">No surah found.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
