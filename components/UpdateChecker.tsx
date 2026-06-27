"use client";

import { useEffect, useState } from "react";
import { BUILD_VERSION } from "@/lib/version";

/**
 * Keeps the app fresh on a static host (GitHub Pages caches HTML ~10 min).
 * On load it fetches version.json (bypassing cache); if the deployed version is
 * newer than the one this build was stamped with, it reloads once past the cache
 * by navigating with a fresh ?v= query. Guarded against reload loops.
 */
export default function UpdateChecker() {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = (auto: boolean) => {
      fetch(`version.json?ts=${Date.now()}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { version?: string } | null) => {
          if (cancelled || !data?.version) return;
          if (data.version === BUILD_VERSION) return;

          let alreadyTried: string | null = null;
          try {
            alreadyTried = sessionStorage.getItem("dugsi:updated");
          } catch {
            /* sessionStorage unavailable */
          }

          if (auto && alreadyTried !== data.version) {
            try {
              sessionStorage.setItem("dugsi:updated", data.version);
            } catch {
              /* ignore */
            }
            const url = new URL(window.location.href);
            url.searchParams.set("v", data.version);
            window.location.replace(url.toString());
          } else {
            setPending(data.version); // fall back to a manual button
          }
        })
        .catch(() => {});
    };

    check(true);
    const id = setInterval(() => check(false), 60_000);
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
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3">
      <button
        onClick={update}
        className="rounded-full bg-emerald px-5 py-2.5 text-sm font-semibold text-white shadow-soft animate-in"
      >
        A new version is available — tap to update
      </button>
    </div>
  );
}
