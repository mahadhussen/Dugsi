"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import AccountButton from "./AccountButton";

const LINKS = [
  { href: "/", label: "Recitera", sub: "Läs upp & få feedback", icon: "mic" },
  { href: "/listen", label: "Lyssna", sub: "Hela Koranen, valfri Sheikh", icon: "play" },
  { href: "/prayer", label: "Bönetider", sub: "Göteborg · adhan", icon: "clock" },
] as const;

function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    mic: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 9a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-2.08A7 7 0 0 0 19 12h-2a5 5 0 0 1-10 0H5z" />,
    play: <path d="M8 5v14l11-7z" />,
    clock: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10V6h-2v8h6v-2h-4z" />,
    menu: <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      {paths[name]}
    </svg>
  );
}

export default function AppNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on route change and on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const active = LINKS.find((l) => isActive(l.href)) ?? LINKS[0];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-emerald-dark/95 backdrop-blur">
        <div className="relative mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5">
          <button
            onClick={() => setOpen(true)}
            aria-label="Öppna meny"
            className="grid h-10 w-10 place-items-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            <Icon name="menu" className="h-6 w-6" />
          </button>
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight text-white">Dugsi</span>
            <span className="text-sm text-gold-soft/80">{active.label}</span>
          </Link>
          <AccountButton />
        </div>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-50 flex bg-ink/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <nav
            className="flex h-full w-72 max-w-[80%] flex-col bg-parchment shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gold/20 bg-emerald-dark px-5 py-4">
              <span className="text-lg font-bold text-white">Dugsi</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Stäng meny"
                className="grid h-8 w-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
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
                        on ? "bg-emerald/10 ring-1 ring-emerald/25" : "hover:bg-emerald/5"
                      }`}
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                          on ? "bg-emerald text-white" : "bg-gold/15 text-emerald"
                        }`}
                      >
                        <Icon name={l.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold ${on ? "text-emerald-deep" : "text-ink"}`}>
                          {l.label}
                        </span>
                        <span className="block truncate text-xs text-ink/50">{l.sub}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-gold/20 p-4 text-center text-[11px] text-ink/40">
              Gratis · inga annonser
            </p>
          </nav>
        </div>
      )}
    </>
  );
}
