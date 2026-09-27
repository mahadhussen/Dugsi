"use client";

import type { WordStatus } from "@/lib/align";

const statusClass: Record<WordStatus, string> = {
  correct: "word-correct",
  close: "word-close",
  wrong: "word-wrong",
  missing: "word-missing",
};

export interface WordSpanProps {
  text: string;
  translit?: string;
  /** Hidden for memorisation: renders as an empty ruled slot; tap to reveal. */
  masked?: boolean;
  onReveal?: () => void;
  /** Tajweed colour class (when no recitation feedback is shown). */
  colorClass?: string | null;
  status?: WordStatus;
  active?: boolean;
  madd?: "good" | "rushed" | "unknown";
  /** Follow the word with a space (flowing text); off inside a mushaf line. */
  space?: boolean;
}

/** One Quran word as it appears on the page, with its recitation marks. */
export function WordSpan({ text, translit, masked, onReveal, colorClass, status, active, madd, space = true }: WordSpanProps) {
  const sp = space ? " " : "";
  if (masked) {
    return (
      <span className="word word-mask" onClick={onReveal} role="button" tabIndex={0} aria-label="Hidden word — tap to reveal">
        {text}
        {sp}
      </span>
    );
  }
  return (
    <span className={`word ${colorClass ?? ""} ${status ? statusClass[status] : ""} ${active ? "word-active" : ""}`} title={translit}>
      {text}
      {madd === "rushed" && (
        <sup className="ml-0.5 text-xs" style={{ color: "var(--bad)" }} title="Elongation may be rushed">
          ⏱
        </sup>
      )}
      {sp}
    </span>
  );
}
