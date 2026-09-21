import QuranTrainer from "@/components/QuranTrainer";
import Legend from "@/components/Legend";
import ProgressPanel from "@/components/ProgressPanel";
import { Wordmark } from "@/components/Logo";
import { BUILD_VERSION } from "@/lib/version";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-emerald/10 px-3 py-1 text-xs font-medium text-emerald-bright ring-1 ring-emerald/25">
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      {/* Header */}
      <header className="pt-6 text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <h1 className="mt-4 text-xl font-semibold text-ink sm:text-2xl">Recite. Get checked, word by word.</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">
          Read from the mushaf below and Dugsi follows along — gently, every word.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Badge>100% free</Badge>
          <Badge>No ads, ever</Badge>
          <Badge>Live mistakes</Badge>
          <Badge>Memorise · peek · goals</Badge>
          <Badge>Sync across devices</Badge>
        </div>
      </header>

      {/* Recite + mushaf first — the book is the app */}
      <section className="mt-6">
        <QuranTrainer />
      </section>

      {/* Today */}
      <section className="mt-8 empty:mt-0">
        <ProgressPanel />
      </section>

      <section className="mt-10">
        <Legend />
      </section>

      <footer className="mt-10 border-t border-gold/20 pt-6 text-center text-xs text-ink/50">
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
