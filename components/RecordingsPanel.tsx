"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { listRecordings, deleteRecording, type StoredRecording } from "@/lib/recordings";
import { surahMeta } from "@/lib/quran";

/** Your own recordings, kept only on this device: play back, slow down,
 *  download, delete. */
export default function RecordingsPanel() {
  const [recs, setRecs] = useState<StoredRecording[] | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const refresh = () => void listRecordings().then(setRecs);
  useEffect(() => {
    refresh();
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPlaying(null);
  };

  const play = (r: StoredRecording) => {
    if (playing === r.surah) return stop();
    stop();
    const url = URL.createObjectURL(r.blob);
    urlRef.current = url;
    const a = new Audio(url);
    a.playbackRate = rate;
    a.onended = () => stop();
    a.onerror = () => stop();
    audioRef.current = a;
    setPlaying(r.surah);
    void a.play().catch(() => stop());
  };

  const changeRate = (v: number) => {
    setRate(v);
    if (audioRef.current) audioRef.current.playbackRate = v;
  };

  const download = (r: StoredRecording) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(r.blob);
    const ext = r.blob.type.includes("mp4") ? "m4a" : r.blob.type.includes("ogg") ? "ogg" : "webm";
    a.download = `dugsi-surah-${r.surah}-${new Date(r.createdAt).toISOString().slice(0, 10)}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const remove = async (r: StoredRecording) => {
    if (!window.confirm(`Delete your recording of ${surahMeta(r.surah)?.transliteration ?? "surah " + r.surah}?`)) return;
    if (playing === r.surah) stop();
    await deleteRecording(r.surah);
    refresh();
  };

  if (!recs) return <p className="text-xs text-ink/40">Loading…</p>;
  if (recs.length === 0) {
    return <p className="text-sm text-ink/55">No recordings on this device yet. Every recitation is recorded automatically so you can listen back — your audio never leaves your device.</p>;
  }
  const total = recs.reduce((a, r) => a + r.blob.size, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink/55">
        <span>
          {recs.length} recording{recs.length > 1 ? "s" : ""} · {(total / 1024 / 1024).toFixed(1)} MB on this device · latest per surah
        </span>
        <span className="flex items-center gap-1">
          Speed
          {[0.75, 1, 1.25].map((v) => (
            <button
              key={v}
              onClick={() => changeRate(v)}
              className={`rounded-full px-2 py-0.5 font-medium ring-1 ${rate === v ? "bg-ink text-white ring-ink" : "ring-ink/15 hover:bg-ink/5"}`}
            >
              {v}×
            </button>
          ))}
        </span>
      </div>
      <ul className="space-y-2">
        {recs.map((r) => {
          const meta = surahMeta(r.surah);
          const words = Object.keys(r.times).length;
          return (
            <li key={r.surah} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 ring-1 ring-ink/5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{meta?.transliteration ?? `Surah ${r.surah}`}</div>
                <div className="text-xs text-ink/50">
                  {new Date(r.createdAt).toLocaleString()} · {(r.blob.size / 1024 / 1024).toFixed(1)} MB
                  {words > 0 ? ` · ${words} words timed` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => play(r)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${
                    playing === r.surah ? "bg-ink text-white ring-ink" : "text-ink/80 ring-ink/20 hover:bg-ink/5"
                  }`}
                >
                  {playing === r.surah ? "■ Stop" : "▶ Play"}
                </button>
                <Link href={`/quran?surah=${r.surah}`} className="hidden rounded-full px-2.5 py-1 text-xs font-semibold text-emerald ring-1 ring-emerald/30 sm:inline">
                  Recite
                </Link>
                <button onClick={() => download(r)} aria-label="Download" title="Download" className="rounded-full px-2 py-1 text-xs text-ink/60 ring-1 ring-ink/15 hover:bg-ink/5">
                  ⤓
                </button>
                <button onClick={() => void remove(r)} aria-label="Delete" title="Delete" className="rounded-full px-2 py-1 text-xs text-red-500 ring-1 ring-red-500/30 hover:bg-red-500/100/10">
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
