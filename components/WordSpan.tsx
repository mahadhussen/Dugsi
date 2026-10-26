"use client";

import type { WordStatus } from "@/lib/align";

/** A word's mark on the page: a judgement, or "reading" (passed while
 *  reciting, not judged yet) with the step at which it lit up. */
export type ViewStatus = WordStatus | `reading${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`;

const statusClass: Record<WordStatus, string> = {
  correct: "word-correct",
  close: "word-close",
  wrong: "word-wrong",
  missing: "word-missing",
  unclear: "word-unclear",
};
const classOf = (s: ViewStatus) => (s.startsWith("reading") ? `word-reading rd${s.slice(7)}` : statusClass[s as WordStatus]);

export interface WordSpanProps {
  text: string;
  translit?: string;
  /** Hidden for memorisation: renders as an empty ruled slot; tap to reveal. */
  masked?: boolean;
  onReveal?: () => void;
  /** Tajweed colour class (when no recitation feedback is shown). */
  colorClass?: string | null;
  status?: ViewStatus;
  active?: boolean;
  madd?: "good" | "rushed" | "unknown";
  /** Follow the word with a space (flowing text); off inside a mushaf line. */
  space?: boolean;
  /** "surah:verse", so a text selection can be turned into verses to play. */
  sv?: string;
}

/** One Quran word as it appears on the page, with its recitation marks. */
export function WordSpan({ text, translit, masked, onReveal, colorClass, status, active, madd, space = true, sv }: WordSpanProps) {
  const sp = space ? " " : "";
  if (masked) {
    return (
      <span className="word word-mask" data-sv={sv} onClick={onReveal} role="button" tabIndex={0} aria-label="Hidden word — tap to reveal">
        {text}
        {sp}
      </span>
    );
  }
  return (
    <span className={`word ${colorClass ?? ""} ${status ? classOf(status) : ""} ${active ? "word-active" : ""}`} title={translit} data-sv={sv}>
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
