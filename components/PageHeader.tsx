"use client";

import Link from "next/link";
import { NavIcon } from "./BottomNav";

/** The one header used on every page: a big title, an optional way back, and
 *  room for one control on the right. */
export default function PageHeader({
  title,
  sub,
  back,
  right,
  center = false,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  back?: { href: string; label: string };
  right?: React.ReactNode;
  center?: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-ink/10 bg-shell/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
        {back ? (
          <Link href={back.href} aria-label={back.label} className="icon-btn">
            <NavIcon name="back" className="h-7 w-7" />
          </Link>
        ) : null}
        <div className={`min-w-0 flex-1 leading-tight ${center ? "text-center" : ""}`}>
          <div className="truncate text-xl font-extrabold text-ink">{title}</div>
          {sub ? <div className="truncate text-sm font-semibold text-ink/60">{sub}</div> : null}
        </div>
        {right}
      </div>
    </header>
  );
}
