"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Brain, Database, Grid3x3, LayoutDashboard, Menu, ScanSearch, Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/practice/matrigma", label: "Matrix practice", Icon: Grid3x3 },
  { href: "/practice/map", label: "Personality practice", Icon: Brain },
  { href: "/analyze", label: "Analyze screenshot", Icon: ScanSearch },
  { href: "/statistics", label: "Statistics", Icon: BarChart3 },
  { href: "/question-bank", label: "Question bank", Icon: Database },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function AppNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-col gap-1 p-3" aria-label="Main">
      {LINKS.map(({ href, label, Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <span className="font-semibold">Assessment Trainer</span>
        <button aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)} className="rounded-md p-2 hover:bg-muted">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && <div className="border-b border-border bg-card md:hidden">{nav}</div>}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:block">
        <div className="sticky top-0">
          <div className="border-b border-border px-5 py-5">
            <p className="font-semibold">Assessment Trainer</p>
            <p className="mt-1 text-xs text-muted-foreground">Practice tool · runs locally</p>
          </div>
          {nav}
          <p className="px-5 pt-4 text-[11px] leading-relaxed text-muted-foreground">
            For practice with your own and synthetic questions only — not for use during a real recruitment test.
          </p>
        </div>
      </aside>
    </>
  );
}
