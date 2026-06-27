import QuranTrainer from "@/components/QuranTrainer";
import Legend from "@/components/Legend";
import { Wordmark } from "@/components/Logo";
import { fatiha } from "@/lib/quran/fatiha";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-gold-soft ring-1 ring-white/15">
      {children}
    </span>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      {/* Hero */}
      <header className="relative -mx-4 overflow-hidden rounded-b-[2rem] bg-emerald-dark px-6 pb-10 pt-8 text-center shadow-soft sm:px-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #e3c987 0 2px, transparent 3px), radial-gradient(circle at 80% 60%, #e3c987 0 2px, transparent 3px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative">
          <div className="flex justify-center">
            <Wordmark />
          </div>

          <p className="ayah mx-auto mt-6 text-3xl text-gold-soft sm:text-4xl" dir="rtl">
            {fatiha.nameArabic}
          </p>
          <h1 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
            Recite the Quran. Get instant feedback.
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
            Read aloud and Dugsi checks every word with you — gently, word by word.
          </p>

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Badge>100% free</Badge>
            <Badge>No sign-up · no ads</Badge>
            <Badge>Nothing stored or tracked</Badge>
          </div>
        </div>
      </header>

      {/* Recite + surah */}
      <section className="mt-8">
        <QuranTrainer />
      </section>

      <section className="mt-10">
        <Legend />
      </section>

      <footer className="mt-10 border-t border-gold/20 pt-6 text-center text-xs text-ink/50">
        <p className="mx-auto max-w-md">
          Free, no account, and nothing is stored or tracked. The live word-by-word marking uses
          your browser&apos;s speech recognition (in some browsers, e.g. Chrome, that transcribes
          audio in the cloud). <strong>High accuracy</strong> adds a precise check that runs fully on
          your device. The tajweed colours are a learning guide — always learn tajweed with a
          qualified teacher.
        </p>
      </footer>
    </main>
  );
}
