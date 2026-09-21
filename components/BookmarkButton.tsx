"use client";

import { useBookmarks, toggleBookmark } from "@/lib/bookmarks";
import { useAuth } from "@/lib/supabase/AuthProvider";

/** Per-verse bookmark toggle. Subscribes to the bookmark store itself so the
 *  (memoised) verse it sits in never has to re-render for it. */
export default function BookmarkButton({ surah, verse }: { surah: number; verse: number }) {
  const bookmarks = useBookmarks();
  const { user } = useAuth();
  const on = bookmarks.some((b) => b.surah === surah && b.verse === verse);
  return (
    <button
      onClick={() => toggleBookmark(surah, verse, user?.id ?? null)}
      aria-pressed={on}
      aria-label={on ? "Remove bookmark" : "Bookmark this verse"}
      title={on ? "Bookmarked" : "Bookmark"}
      className={`ml-0.5 inline-grid h-7 w-7 place-items-center rounded-full align-middle transition ${
        on ? "text-gold-deep" : "text-ink/30 hover:bg-gold/10 hover:text-gold-deep"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6 3h12v18l-6-4-6 4V3z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
