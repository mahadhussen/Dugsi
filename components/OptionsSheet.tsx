"use client";

import { useState } from "react";
import Sheet from "./Sheet";
import { useSettings, updateSettings } from "@/lib/settings";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { useReaderPosition } from "@/lib/reader-store";
import { useBookmarks, toggleBookmark } from "@/lib/bookmarks";
import { setReading, type Range } from "@/lib/reading-store";

/** Everything optional on the Quran page, in one plain list of switches. */
export default function OptionsSheet({
  surahId,
  ayahCount,
  range,
  onClose,
}: {
  surahId: number;
  ayahCount: number;
  range: Range | null;
  onClose: () => void;
}) {
  const settings = useSettings();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const pos = useReaderPosition();
  const bookmarks = useBookmarks();
  const marked = bookmarks.some((b) => b.surah === pos.surah && b.verse === pos.verse);
  const set = (patch: Parameters<typeof updateSettings>[0]) => updateSettings(patch, userId);

  const [from, setFrom] = useState(String(range?.from ?? 1));
  const [to, setTo] = useState(String(range?.to ?? Math.min(ayahCount, 5)));
  const applyRange = () => {
    const f = Math.max(1, Math.min(ayahCount, Number(from) || 1));
    const t = Math.max(f, Math.min(ayahCount, Number(to) || f));
    setReading({ range: { from: f, to: t } });
    onClose();
  };

  return (
    <Sheet title="Options" onClose={onClose} tall={false}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Group title="On the page">
          <Switch label="Translation" hint="English under each verse" on={settings.showTranslation} onChange={(v) => set({ showTranslation: v })} />
          <Switch label="Latin letters" hint="How to pronounce each verse" on={settings.showTranslit} onChange={(v) => set({ showTranslit: v })} />
          <Switch label="Tajweed colours" hint="Colour the rules of recitation" on={settings.showTajweed} onChange={(v) => set({ showTajweed: v })} />
          <Row>
            <button
              onClick={() => toggleBookmark(pos.surah, pos.verse, userId)}
              className={`btn-quiet w-full ${marked ? "border-emerald text-emerald-bright" : ""}`}
            >
              {marked ? `★ Bookmarked verse ${pos.verse}` : `☆ Bookmark verse ${pos.verse}`}
            </button>
          </Row>
        </Group>

        {ayahCount > 10 && (
          <Group title="Practise only some verses">
            <Row>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-ink">From</span>
                <NumberBox value={from} onChange={setFrom} max={ayahCount} label="From verse" />
                <span className="text-base font-bold text-ink">to</span>
                <NumberBox value={to} onChange={setTo} max={ayahCount} label="To verse" />
                <button onClick={applyRange} className="btn-primary min-h-[3rem] px-4 text-base">
                  Use these
                </button>
                {range && (
                  <button
                    onClick={() => {
                      setReading({ range: null });
                      onClose();
                    }}
                    className="btn-quiet min-h-[3rem] px-4 text-base"
                  >
                    Whole surah
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm font-semibold text-ink/50">
                Surah {surahId} has {ayahCount} verses. Only the chosen verses are scored.
              </p>
            </Row>
          </Group>
        )}

        <Group title="While reciting">
          <Switch label="Mark mistakes as I go" hint="Skipped words turn grey and wrong words red while you recite" on={settings.liveMistakes} onChange={(v) => set({ liveMistakes: v })} />
          <Switch label="Stop by itself" hint="After 6 seconds of silence" on={settings.autoStop} onChange={(v) => set({ autoStop: v })} />
          <Switch label="Quran-tuned checker" hint="A more precise check that runs on this device (80 MB, downloaded once)" on={settings.quranModel} onChange={(v) => set({ quranModel: v })} />
        </Group>

        <Group title="Screen">
          <Switch label="Dark screen" hint="Easier on the eyes at night" on={settings.theme === "dark"} onChange={(v) => set({ theme: v ? "dark" : "light" })} />
        </Group>
      </div>
      <div className="border-t-2 border-ink/10 p-3">
        <button onClick={onClose} className="btn-primary w-full">
          Done
        </button>
      </div>
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b-2 border-ink/10 pb-1">
      <h3 className="px-4 pb-1 pt-4 text-xs font-extrabold uppercase tracking-wide text-ink/50">{title}</h3>
      {children}
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3">{children}</div>;
}

function Switch({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-base font-bold text-ink">{label}</span>
        {hint && <span className="block text-sm font-semibold text-ink/50">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? "bg-emerald" : "bg-ink/20"}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-7" : "left-1"}`} />
      </button>
    </label>
  );
}

function NumberBox({ value, onChange, max, label }: { value: string; onChange: (v: string) => void; max: number; label: string }) {
  return (
    <input
      type="number"
      min={1}
      max={max}
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="h-12 w-20 rounded-xl border-2 border-ink/15 bg-surface text-center text-lg font-bold text-ink outline-none focus:border-emerald"
    />
  );
}
