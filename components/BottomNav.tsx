"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/quran", label: "Quran", icon: "book" },
  { href: "/progress", label: "Progress", icon: "star" },
  { href: "/prayer", label: "Prayer", icon: "clock" },
] as const;

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <path d="M12 3 2 12h3v9h5v-6h4v6h5v-9h3L12 3z" />,
    book: <path d="M4 3h7a3 3 0 0 1 3 3v15a2 2 0 0 0-2-2H4V3zm16 0h-7a3 3 0 0 0-3 3v15a2 2 0 0 1 2-2h8V3zM6 5v12h5.5c.2 0 .3 0 .5.1V6a1 1 0 0 0-1-1H6z" />,
    star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z" />,
    clock: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10V6h-2v8h6v-2h-4z" />,
    mic: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 9a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-2.08A7 7 0 0 0 19 12h-2a5 5 0 0 1-10 0H5z" />,
    play: <path d="M8 5v14l11-7z" />,
    back: <path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2z" />,
    gear: <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.7 7.7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.4-2.7a7.7 7.7 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />,
    chevron: <path d="M9 6l6 6-6 6-1.4-1.4L12.2 12 7.6 7.4 9 6z" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3z" />,
    bookmarkOff: <path d="M17 3H7a1 1 0 0 0-1 1v17l6-4 6 4V4a1 1 0 0 0-1-1zm-1 15.3-4-2.7-4 2.7V5h8v13.3z" />,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" fillRule="evenodd" aria-hidden>
      {paths[name]}
    </svg>
  );
}

/** Four big tabs at the bottom: the only navigation in the app. */
export default function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink/10 bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
        {TABS.map((t) => {
          const on = isActive(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[13px] font-bold transition ${
                  on ? "text-emerald-bright" : "text-ink/55 hover:text-ink"
                }`}
              >
                <span className={`grid h-8 w-14 place-items-center rounded-full ${on ? "bg-emerald/15" : ""}`}>
                  <NavIcon name={t.icon} className="h-6 w-6" />
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
