# Dugsi — Quran Recitation & Tajweed Trainer

Recite the Quran aloud and get **instant, word-by-word feedback** on your
accuracy and tajweed. A free, open alternative to paid recitation apps — built
to be honest about what it can and can't yet verify.

**MVP scope:** Surah Al-Fatiha (Surah 1). The architecture generalises to the
full Quran; Al-Fatiha is the first surah to prove the loop end to end.

---

**Free for everyone. No API key, no server, no cost.** Speech recognition runs
**on the user's own device** in the browser (Web Speech API), and all the
word-checking is plain JavaScript that runs client-side — so the app is a static
site anyone can host for free, and a reciter's voice never leaves their phone.

## What it does today

1. **Recitation accuracy.** You recite into the mic; the browser recognises your
   Arabic on-device, then each spoken word is aligned against the verified
   Uthmani text of Al-Fatiha using diacritic-insensitive fuzzy matching. Every
   word is marked **correct / close / needs-work / skipped**.
2. **Tajweed guide.** The surah is rendered with colour-coded tajweed rules
   (madd, sun/moon letters, leen, lām of Allah, tafkhīm, …) so you can learn the
   rules as you read.

### Honest limits

- The browser speech recogniser is a general Arabic model, not Quran-specialised,
  so it can misread classical Arabic. A word marked wrong may be the recogniser,
  not the reciter.
- On-device recognition gives no word-level timing, so acoustic tajweed checks
  (madd length, makharij, ghunnah, qalqalah) are **not** measured yet — the
  colour guide teaches them, but the app doesn't grade them. A future
  "high-accuracy" mode (on-device Whisper) can add real timing analysis.
- Needs a browser with the Web Speech API — **Chrome** (desktop/Android) or
  **Safari** (iOS). Firefox isn't supported yet.
- **Always learn tajweed with a qualified teacher.** This is a practice aid.

---

## Architecture

```
app/
  page.tsx                 Home: recorder + surah + tajweed legend
components/
  Reciter.tsx              On-device recognition + results UI (client)
  SurahView.tsx            Ayah rendering with tajweed colours / result overlay
  Legend.tsx               Tajweed colour key
lib/
  quran/fatiha.ts          Verified text + per-word tajweed metadata
  arabic.ts                Normalisation, tokenisation, similarity
  align.ts                 Needleman–Wunsch word alignment (heard vs expected)
  analyze.ts               Orchestrates alignment + scoring (runs client-side)
  speech/recognizer.ts     Web Speech API wrapper (free, on-device)
  tajweed/rules.ts         Rule colours + descriptions
  tajweed/timing.ts        Madd-timing engine (used by the future Whisper mode)
  transcribe/              Pluggable STT engine seam (Whisper, for a future
                           opt-in "high accuracy" mode — not used by default)
```

Recognition + analysis both run in the browser, so the deployed app needs no
backend and no secrets. The `lib/transcribe` seam keeps the door open to add an
optional on-device Whisper engine later for higher accuracy and timing.

---

## Run it locally

```bash
npm install
npm run dev      # http://localhost:3000  (no API key needed)
```

Then open the app in **Chrome**, tap **Start reciting**, recite Surah
Al-Fatiha, and tap stop. A microphone is the only requirement.

### Tests

```bash
npm test
```

Covers Arabic normalisation, word alignment (perfect / skipped / wrong word),
and end-to-end scoring.

---

## Roadmap

- More surahs (the data model already supports it).
- Quran-tuned acoustic model for transcription and real phonetic tajweed
  (makharij, ghunnah, qalqalah) instead of timing heuristics.
- Live word highlighting while reciting (streaming).
- Progress tracking and memorisation (hifz) mode.
