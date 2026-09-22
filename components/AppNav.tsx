"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import AccountButton from "./AccountButton";
import { surahMeta } from "@/lib/quran";
import { useReaderPosition } from "@/lib/reader-store";
import { useBookmarks, toggleBookmark } from "@/lib/bookmarks";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { Wordmark } from "./Logo";

const LINKS = [
  { href: "/", label: "Recite", sub: "Read aloud, get checked word by word", icon: "mic" },
  { href: "/listen", label: "Listen", sub: "The whole Quran, any Sheikh", icon: "play" },
  { href: "/progress", label: "Progress", sub: "Stats, goals, mistakes, recordings", icon: "chart" },
  { href: "/prayer", label: "Prayer times", sub: "Gothenburg · adhan", icon: "clock" },
  { href: "/about", label: "About & sources", sub: "Licences, models, honest limits", icon: "info" },
] as const;

function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    mic: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 9a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-2.08A7 7 0 0 0 19 12h-2a5 5 0 0 1-10 0H5z" />,
    play: <path d="M8 5v14l11-7z" />,
    clock: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10V6h-2v8h6v-2h-4z" />,
    chart: <path d="M4 20h16v2H2V2h2v18zm3-2V9h3v9H7zm5 0V4h3v14h-3zm5 0v-6h3v6h-3z" />,
    info: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />,
    menu: <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />,
    search: <path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3z" />,
    bookmarkOff: <path d="M17 3H7a1 1 0 0 0-1 1v17l6-4 6 4V4a1 1 0 0 0-1-1zm-1 15.3-4-2.7-4 2.7V5h8v13.3z" />,
    gear: <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.4-2.7a7.7 7.7 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      {paths[name]}
    </svg>
  );
}

const btn = "grid h-10 w-10 place-items-center rounded-xl text-ink/80 transition hover:bg-ink/10 hover:text-ink";

export default function AppNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const pos = useReaderPosition();
  const bookmarks = useBookmarks();
  const { user } = useAuth();

  // Close the drawer on route change and on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const active = LINKS.find((l) => isActive(l.href)) ?? LINKS[0];
  const reader = pathname === "/" || pathname.startsWith("/listen");
  const meta = surahMeta(pos.surah);
  const marked = bookmarks.some((b) => b.surah === pos.surah && b.verse === pos.verse);

  const goSurah = (id: number) => {
    if (id < 1 || id > 114) return;
    window.dispatchEvent(new CustomEvent("dugsi:goto-surah", { detail: id }));
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-surface/95 backdrop-blur">
        <div className="relative mx-auto flex max-w-3xl items-center gap-1 px-2 py-1.5">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className={btn}>
            <Icon name="menu" className="h-6 w-6" />
          </button>
          {reader ? (
            <>
              <button
                onClick={() => window.dispatchEvent(new Event("dugsi:open-picker"))}
                aria-label="Find a surah"
                className={btn}
              >
                <Icon name="search" className="h-6 w-6" />
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1 text-center">
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[15px] font-semibold text-ink">Chapter {meta?.transliteration ?? pos.surah}</div>
                  <div className="whitespace-nowrap text-[11px] text-ink/60">
                    Chapter {pos.surah} <span className="text-ink/30">|</span> Verse {pos.verse}
                    {pos.page ? (
                      <>
                        {" "}
                        <span className="text-ink/30">|</span> Page {pos.page}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col">
                  <button onClick={() => goSurah(pos.surah - 1)} aria-label="Previous surah" className="px-1 text-ink/60 hover:text-ink disabled:opacity-30" disabled={pos.surah <= 1}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M12 8l6 6H6z" /></svg>
                  </button>
                  <button onClick={() => goSurah(pos.surah + 1)} aria-label="Next surah" className="px-1 text-ink/60 hover:text-ink disabled:opacity-30" disabled={pos.surah >= 114}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M12 16l-6-6h12z" /></svg>
                  </button>
                </div>
              </div>
              <button
                onClick={() => toggleBookmark(pos.surah, pos.verse, user?.id ?? null)}
                aria-pressed={marked}
                aria-label={marked ? "Remove bookmark" : "Bookmark this verse"}
                className={`${btn} ${marked ? "text-emerald" : ""}`}
              >
                <Icon name={marked ? "bookmark" : "bookmarkOff"} className="h-6 w-6" />
              </button>
              <Link href="/progress#goals" aria-label="Settings" className={btn}>
                <Icon name="gear" className="h-6 w-6" />
              </Link>
            </>
          ) : (
            <>
              <Link href="/" className="flex items-baseline gap-2 px-1">
                <span className="text-lg font-bold tracking-tight text-ink">Dugsi</span>
                <span className="text-sm text-ink/60">{active.label}</span>
              </Link>
              <div className="flex-1" />
              <AccountButton />
            </>
          )}
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <nav className="flex h-full w-72 max-w-[80%] flex-col bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <Wordmark />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-8 w-8 place-items-center rounded-full text-ink/60 transition hover:bg-ink/10 hover:text-ink"
              >
                ✕
              </button>
            </div>
            <ul className="flex-1 space-y-1 p-3">
              {LINKS.map((l) => {
                const on = isActive(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 transition ${
                        on ? "bg-emerald/10 ring-1 ring-emerald/25" : "hover:bg-ink/5"
                      }`}
                    >
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${on ? "bg-emerald text-white" : "bg-ink/5 text-emerald"}`}>
                        <Icon name={l.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold ${on ? "text-emerald-bright" : "text-ink"}`}>{l.label}</span>
                        <span className="block truncate text-xs text-ink/50">{l.sub}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-ink/10 p-4">
              <AccountButton inline />
              <p className="mt-3 text-center text-[11px] text-ink/40">Free · no ads · no tracking</p>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
