"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Recite", icon: "mic" },
  { href: "/listen", label: "Listen", icon: "play" },
  { href: "/progress", label: "Progress", icon: "chart" },
  { href: "/prayer", label: "Prayer", icon: "clock" },
] as const;

function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    mic: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-7 9a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-2.08A7 7 0 0 0 19 12h-2a5 5 0 0 1-10 0H5z" />,
    play: <path d="M8 5v14l11-7z" />,
    chart: <path d="M4 20h16v2H2V2h2v18zm3-2V9h3v9H7zm5 0V4h3v14h-3zm5 0v-6h3v6h-3z" />,
    clock: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10V6h-2v8h6v-2h-4z" />,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      {paths[name]}
    </svg>
  );
}

/** App-style tab bar pinned to the bottom (the drawer still holds everything). */
export default function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around">
        {TABS.map((t) => {
          const on = isActive(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${
                  on ? "text-emerald-bright" : "text-ink/50 hover:text-ink"
                }`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full ${on ? "bg-emerald/20" : ""}`}>
                  <Icon name={t.icon} className="h-5 w-5" />
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
