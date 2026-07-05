"use client";

// Segment error boundary: a thrown render error shows a calm recovery card
// instead of a white screen. Recitation, progress and recordings are unaffected.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="ayah text-3xl text-emerald" dir="rtl">
        ﷽
      </p>
      <h1 className="text-lg font-bold text-ink">Something went wrong</h1>
      <p className="text-sm text-ink/60">
        The page hit an unexpected error. Your progress and recordings are safe. Try again, or
        reload the page.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-gradient-to-b from-emerald to-emerald-deep px-4 py-2 text-sm font-semibold text-white shadow-soft"
        >
          Try again
        </button>
        <button
          onClick={() => location.reload()}
          className="rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium text-ink/80 transition hover:bg-ink/5"
        >
          Reload
        </button>
      </div>
    </main>
  );
}
