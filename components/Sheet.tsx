"use client";

import { useEffect } from "react";

/** A bottom sheet (a centred dialog on wide screens) with a big title and a
 *  big close button. All the app's pickers and option panels use it. */
export default function Sheet({ title, onClose, children, tall = true }: { title: string; onClose: () => void; children: React.ReactNode; tall?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-2 border-ink/10 bg-surface shadow-soft sm:rounded-3xl ${tall ? "h-[90vh] sm:h-[85vh]" : "max-h-[90vh]"}`}
      >
        <div className="flex items-center justify-between gap-2 border-b-2 border-ink/10 px-4 py-3">
          <h2 className="text-xl font-extrabold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="icon-btn text-2xl">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
