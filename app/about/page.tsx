import Link from "next/link";
import { BUILD_VERSION } from "@/lib/version";

export const metadata = {
  title: "Dugsi — About, sources & licences",
  description:
    "What Dugsi is built from: the Quran text, translations, recitation audio, word timings, speech models and open-source libraries, with their licences.",
};

interface Source {
  name: string;
  what: string;
  licence: string;
  url: string;
  note?: string;
}

const DATA: Source[] = [
  {
    name: "Tanzil Project",
    what: "Transliteration and the Saheeh International English translation (via quran-json).",
    licence: "Creative Commons Attribution 3.0 — text must stay unmodified and link back to tanzil.net",
    url: "https://tanzil.net",
    note: "Dugsi shows the text verbatim; nothing is edited.",
  },
  {
    name: "The Noble Qur'an Encyclopedia (quranenc.com)",
    what: "Uthmani Quran text, Hafs ʿan ʿĀṣim (via quran-json).",
    licence: "Free to use with attribution",
    url: "https://quranenc.com",
  },
  {
    name: "quran-json by Risan Bagja Pradana",
    what: "The JSON packaging of the text, transliteration and translation Dugsi ships.",
    licence: "MIT",
    url: "https://github.com/risan/quran-json",
  },
  {
    name: "Saheeh International",
    what: "English translation of the meanings of the Quran.",
    licence: "© Saheeh International / Abul-Qasim Publishing House — used unmodified, non-commercially, with attribution",
    url: "https://tanzil.net/trans/",
  },
  {
    name: "EveryAyah.com",
    what: "Verse-by-verse recitation audio for every Sheikh in the Listen page and the ▶ buttons. Streams from their servers at play time.",
    licence: "Public archive of freely distributed recitations; Dugsi links, it does not copy",
    url: "https://everyayah.com",
  },
  {
    name: "quran-align by Collin Fair",
    what: "Word-level timestamps inside the EveryAyah recordings (Alafasy, Al-Husary Muallim, Ash-Shuraim, Al-Minshawi) — powers word highlighting while listening and 'hear the qari say just this word'.",
    licence: "Creative Commons Attribution 4.0",
    url: "https://github.com/cpfair/quran-align",
  },
];

const MODELS: Source[] = [
  {
    name: "Whisper (OpenAI)",
    what: "The speech recognition model family behind the precise on-device check.",
    licence: "MIT",
    url: "https://github.com/openai/whisper",
  },
  {
    name: "whisper-base-ar-quran (Tarteel AI)",
    what: "Whisper base fine-tuned on Quranic recitation. Used through a community ONNX export (YunusZJ/whisper-base-ar-quran-ONNX) when the device can run it.",
    licence: "Apache-2.0",
    url: "https://huggingface.co/tarteel-ai/whisper-base-ar-quran",
  },
  {
    name: "whisper-tiny (Xenova ONNX export)",
    what: "The lighter general model used on phones and as the fallback.",
    licence: "MIT / Apache-2.0",
    url: "https://huggingface.co/Xenova/whisper-tiny",
  },
  {
    name: "Silero VAD",
    what: "Voice activity detection: notices long pauses (hesitations) and powers auto-stop. Runs on the device.",
    licence: "MIT",
    url: "https://github.com/snakers4/silero-vad",
  },
];

const LIBS: Source[] = [
  { name: "Transformers.js (Hugging Face)", what: "Runs Whisper in the browser.", licence: "Apache-2.0", url: "https://github.com/huggingface/transformers.js" },
  { name: "ONNX Runtime Web (Microsoft)", what: "Runs the VAD and Whisper models.", licence: "MIT", url: "https://github.com/microsoft/onnxruntime" },
  { name: "@ricky0123/vad-web", what: "Browser wrapper for Silero VAD.", licence: "ISC", url: "https://github.com/ricky0123/vad" },
  { name: "adhan-js (Batoul Apps)", what: "Prayer time calculation.", licence: "MIT", url: "https://github.com/batoulapps/adhan-js" },
  { name: "Amiri typeface (Khaled Hosny)", what: "The Arabic typeface.", licence: "SIL Open Font License 1.1", url: "https://github.com/aliftype/amiri" },
  { name: "Next.js, React, Tailwind CSS, react-virtuoso, Supabase JS", what: "The app framework and UI.", licence: "MIT / Apache-2.0", url: "https://github.com/vercel/next.js" },
];

function List({ items }: { items: Source[] }) {
  return (
    <ul className="space-y-2">
      {items.map((s) => (
        <li key={s.name} className="rounded-xl border border-white/10 bg-surface-2 px-3 py-2 text-sm">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-bright underline underline-offset-2">
            {s.name}
          </a>
          <p className="text-ink/75">{s.what}</p>
          <p className="text-xs text-ink/50">Licence: {s.licence}</p>
          {s.note && <p className="text-xs text-ink/50">{s.note}</p>}
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 pb-16 pt-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">About Dugsi</h1>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink/60">
          Free, no ads, no tracking. Everything runs in your browser; only your progress syncs if you sign in.
        </p>
      </header>

      <section className="rounded-2xl border border-gold/25 bg-surface/90 p-4 shadow-soft sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/70">Honest limits</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/75">
          <li>Speech recognition can misread classical Arabic. A word marked wrong may be the recogniser, not you.</li>
          <li>The live word marking uses your browser&apos;s speech service; in Chrome that service sends audio to Google to turn it into text. The precise check and the voice activity detection run fully on your device.</li>
          <li>Madd timing is a heuristic from word timestamps, not a phonetic measurement.</li>
          <li>Always learn tajweed with a qualified teacher. Dugsi is a practice aid.</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-gold/25 bg-surface/90 p-4 shadow-soft sm:p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/70">Quran text, translation & audio</h2>
        <List items={DATA} />
      </section>

      <section className="rounded-2xl border border-gold/25 bg-surface/90 p-4 shadow-soft sm:p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/70">Speech & AI models</h2>
        <List items={MODELS} />
        <p className="mt-2 text-xs text-ink/50">
          Models download from Hugging Face / jsDelivr on first use and are cached by your browser. Your audio is never uploaded.
        </p>
      </section>

      <section className="rounded-2xl border border-gold/25 bg-surface/90 p-4 shadow-soft sm:p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/70">Open-source libraries</h2>
        <List items={LIBS} />
      </section>

      <p className="text-center text-xs text-ink/45">
        Dugsi is not affiliated with Tanzil, Tarteel, EveryAyah or any of the projects above.{" "}
        <Link href="/" className="underline underline-offset-2">
          Back to reciting
        </Link>{" "}
        · Version {BUILD_VERSION}
      </p>
    </main>
  );
}
