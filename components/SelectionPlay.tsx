"use client";

import { useEffect, useState } from "react";
import { repeatRange } from "@/lib/listen-engine";
import { getSelectedReciterId } from "@/lib/reciter-store";
import { setReciter as setListenReciter } from "@/lib/listen-engine";

interface Picked {
  surah: number;
  from: number;
  to: number;
}

function svOf(node: Node | null): [number, number] | null {
  const el = node instanceof Element ? node : node?.parentElement;
  const sv = el?.closest("[data-sv]")?.getAttribute("data-sv");
  if (!sv) return null;
  const [s, v] = sv.split(":").map(Number);
  return s > 0 && v > 0 ? [s, v] : null;
}

/**
 * Mark words on the page (press and drag, or long-press on a phone) and the
 * Sheikh reads those verses — once, or three times to learn them. The
 * selection is turned into whole verses: that is what the recordings know.
 */
export default function SelectionPlay() {
  const [picked, setPicked] = useState<Picked | null>(null);

  useEffect(() => {
    const onChange = () => {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setPicked(null);
      const a = svOf(sel.anchorNode);
      const b = svOf(sel.focusNode);
      if (!a || !b || a[0] !== b[0]) return setPicked(null);
      setPicked({ surah: a[0], from: Math.min(a[1], b[1]), to: Math.max(a[1], b[1]) });
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  if (!picked) return null;
  const play = (times: number) => {
    // The engine plays in the chosen Sheikh's voice.
    setListenReciter(getSelectedReciterId());
    repeatRange({ surah: picked.surah, verse: picked.from }, { surah: picked.surah, verse: picked.to }, times, "stop");
    document.getSelection()?.removeAllRanges();
    setPicked(null);
  };
  const label = picked.from === picked.to ? `verse ${picked.from}` : `verses ${picked.from}–${picked.to}`;
  return (
    <div className="fixed inset-x-0 bottom-[12.5rem] z-40 flex justify-center px-3" role="dialog" aria-label="Hear the marked verses">
      <div className="flex items-center gap-2 rounded-full border-2 border-emerald/30 bg-surface px-2 py-1.5 shadow-soft">
        <button onClick={() => play(1)} className="rounded-full bg-emerald px-3 py-1.5 text-sm font-extrabold text-white">
          ▶ Hear {label}
        </button>
        <button onClick={() => play(3)} className="rounded-full px-3 py-1.5 text-sm font-extrabold text-emerald ring-2 ring-emerald/30">
          ×3
        </button>
      </div>
    </div>
  );
}

