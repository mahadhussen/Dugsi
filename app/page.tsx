import Reciter from "@/components/Reciter";
import Legend from "@/components/Legend";
import { fatiha } from "@/lib/quran/fatiha";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <header className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">Dugsi</p>
        <h1 className="mt-1 text-3xl font-bold text-ink sm:text-4xl">
          Quran Recitation &amp; Tajweed Trainer
        </h1>
        <p className="mt-2 text-ink/70">
          Recite <span className="font-arabic text-xl">{fatiha.nameArabic}</span> (Surah
          Al-Fatiha) aloud and get instant word-by-word and tajweed feedback.
        </p>
      </header>

      <section className="mb-8">
        <Reciter />
      </section>

      <section className="mb-10">
        <Legend />
      </section>

      <footer className="border-t border-gold/20 pt-6 text-center text-xs text-ink/50">
        <p>
          100% free and private — your recitation is recognised on your own device, nothing is sent
          to a server. The tajweed colours are a learning guide. Always learn tajweed with a
          qualified teacher.
        </p>
      </footer>
    </main>
  );
}
