"use client";

import { useEffect, useMemo, useState } from "react";
import { SURAHS } from "@/lib/quran";
import Sheet from "./Sheet";

/** Choose a surah: one big list, search by name or number. Opened by the
 *  `dugsi:open-picker` event from wherever the surah is shown. */
export default function SurahPicker({ current, onSelect }: { current: number; onSelect: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("dugsi:open-picker", onOpen);
    return () => window.removeEventListener("dugsi:open-picker", onOpen);
  }, []);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return SURAHS;
    return SURAHS.filter(
      (s) => s.transliteration.toLowerCase().includes(t) || String(s.id) === t || s.nameArabic.includes(query.trim()),
    );
  }, [query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  if (!open) return null;
  return (
    <Sheet title="Choose a surah" onClose={close}>
      <div className="border-b-2 border-ink/10 p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or number…"
          autoFocus
          className="h-12 w-full rounded-xl border-2 border-ink/15 bg-surface px-4 text-base font-semibold text-ink outline-none focus:border-emerald"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((s) => {
          const on = s.id === current;
          return (
            <li key={s.id}>
              <button
                onClick={() => {
                  onSelect(s.id);
                  close();
                }}
                className={`flex w-full items-center gap-3 border-b border-ink/5 px-4 py-3 text-left transition hover:bg-emerald/10 ${on ? "bg-emerald/10" : ""}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-extrabold ${on ? "bg-emerald text-white" : "bg-gold/15 text-gold-soft"}`}>
                  {s.id}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-bold text-ink">{s.transliteration}</span>
                  <span className="text-sm font-semibold text-ink/50">{s.ayahCount} verses</span>
                </span>
                <span className="ayah text-2xl text-emerald-bright" dir="rtl">
                  {s.nameArabic}
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="p-6 text-center text-base font-semibold text-ink/50">No surah found.</li>}
      </ul>
    </Sheet>
  );
}
