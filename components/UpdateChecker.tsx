"use client";

import { useEffect, useState } from "react";
import { BUILD_VERSION } from "@/lib/version";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Tells the user when a newer build is live (GitHub Pages caches HTML ~10 min).
 * It never reloads on its own — a surprise reload looks like a crash — it just
 * shows a button the user can tap to refresh past the cache.
 */
export default function UpdateChecker() {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch(`${BASE}/version.json?ts=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { version?: string } | null) => {
          if (!cancelled && data?.version && data.version !== BUILD_VERSION) {
            setPending(data.version);
          }
        })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!pending) return null;

  const update = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("v", pending);
    window.location.replace(url.toString());
  };

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center p-3">
      <button
        onClick={update}
        className="rounded-full bg-emerald px-5 py-2.5 text-sm font-semibold text-white shadow-soft animate-in"
      >
        A new version is available — tap to update
      </button>
    </div>
  );
}
