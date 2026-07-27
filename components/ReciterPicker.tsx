"use client";

import { useMemo, useState } from "react";
import { RECITERS } from "@/lib/audio-quran";
import { useReciter } from "@/lib/reciter-store";

/** Choose which Sheikh (qari) to listen to. The choice is shared everywhere
 *  audio plays and remembered across visits. */
export default function ReciterPicker() {
  const { reciter, setReciterId } = useReciter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return RECITERS;
    return RECITERS.filter(
      (r) =>
        r.name.toLowerCase().includes(t) ||
        (r.note?.toLowerCase().includes(t) ?? false) ||
        r.arabicName.includes(query.trim()),
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
        <span className="min-w-0">
          <span className="text-xs text-ink/50">Reciter · Sheikh</span>
          <span className="block truncate text-lg font-semibold text-ink">{reciter.name}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="ayah truncate text-xl text-emerald" dir="rtl">
            {reciter.arabicName}
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
                placeholder="Search Sheikh…"
                autoFocus
                className="w-full rounded-lg border border-gold/30 bg-white px-3 py-2 text-sm outline-none focus:border-emerald"
              />
              <button onClick={close} className="px-2 text-sm text-ink/60 hover:text-ink">
                Close
              </button>
            </div>
            <ul className="overflow-y-auto">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => {
                      setReciterId(r.id);
                      close();
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-emerald/5 ${
                      r.id === reciter.id ? "bg-emerald/10" : ""
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold/15 text-emerald">
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                        <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 9a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-2.08A7 7 0 0 0 19 12h-2a5 5 0 0 1-10 0H5z" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                      {r.note && <span className="block truncate text-xs text-ink/45">{r.note}</span>}
                    </span>
                    <span className="ayah shrink-0 text-lg text-emerald" dir="rtl">
                      {r.arabicName}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="p-4 text-center text-sm text-ink/50">No reciter found.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
