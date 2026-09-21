import QuranTrainer from "@/components/QuranTrainer";
import Legend from "@/components/Legend";
import ProgressPanel from "@/components/ProgressPanel";
import { BUILD_VERSION } from "@/lib/version";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      {/* Recite + mushaf first — the book is the app */}
      <section className="mt-3">
        <QuranTrainer />
      </section>

      {/* Today */}
      <section className="mt-8 empty:mt-0">
        <ProgressPanel />
      </section>

      <section className="mt-10">
        <p className="mb-2 text-center text-xs text-ink/50">Turn on <strong>Tajweed</strong> above the page to colour the rules below.</p>
        <Legend />
      </section>

      <footer className="mt-10 border-t border-ink/10 pt-6 text-center text-xs text-ink/50">
        <p className="mx-auto max-w-md">
          Free and no ads. Your <strong>recordings never leave your device</strong> — they are kept
          only in this browser so you can hear yourself, and can be cleared by the browser. One
          honest caveat: the live word marking uses your browser&apos;s built in speech service, and
          in some browsers (for example Chrome) that service sends the microphone audio to the
          browser vendor to turn it into text. On supported devices a more precise check then runs
          fully on your device. With an account, only your reading progress and recitation scores
          sync across devices; your audio never syncs. The tajweed colours are a learning guide —
          always learn tajweed with a qualified teacher.
        </p>
        <p className="mt-3 text-[11px] text-ink/40">Version {BUILD_VERSION}</p>
      </footer>
    </main>
  );
}
