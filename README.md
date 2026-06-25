# Dugsi — Quran Recitation & Tajweed Trainer

Recite the Quran aloud and get **instant, word-by-word feedback** on your
accuracy and tajweed. A free, open alternative to paid recitation apps — built
to be honest about what it can and can't yet verify.

**MVP scope:** Surah Al-Fatiha (Surah 1). The architecture generalises to the
full Quran; Al-Fatiha is the first surah to prove the loop end to end.

---

## What it does today

1. **Recitation accuracy (verified).** You record yourself reciting. The audio is
   transcribed (OpenAI Whisper, Arabic), then each spoken word is aligned against
   the verified Uthmani text of Al-Fatiha using diacritic-insensitive fuzzy
   matching. Every word is marked **correct / close / needs-work / skipped**.
2. **Tajweed guide.** The surah is rendered with colour-coded tajweed rules
   (madd, sun/moon letters, leen, lām of Allah, tafkhīm, …) so you can learn the
   rules as you read.
3. **Madd-timing check (experimental).** Using Whisper's word-level timestamps,
   the app estimates whether your elongations (madd) were held long enough and
   flags rushed ones — e.g. the 6-count madd in *aḍ-ḍāāāllīn*.

### Honest limits

- Tajweed **timing** is a heuristic from timestamps, not a phonetic measurement.
  It catches obviously rushed madds; it does not judge makharij (articulation
  points), ghunnah quality, or subtle vowel length. It's a hint, not a ruling.
- Whisper is a general Arabic model, not Quran-specialised, so transcription can
  occasionally misread. A future version can swap in a Quran-tuned model.
- **Always learn tajweed with a qualified teacher.** This is a practice aid.

---

## Architecture

```
app/
  page.tsx                 Home: recorder + surah + tajweed legend
  api/transcribe/route.ts  Receives audio → transcribe → analyze → JSON feedback
components/
  Reciter.tsx              Mic recording + results UI (client)
  SurahView.tsx            Ayah rendering with tajweed colours / result overlay
  Legend.tsx               Tajweed colour key
lib/
  quran/fatiha.ts          Verified text + per-word tajweed metadata
  arabic.ts                Normalisation, tokenisation, similarity
  align.ts                 Needleman–Wunsch word alignment (heard vs expected)
  analyze.ts               Orchestrates alignment + timing + scoring
  tajweed/rules.ts         Rule colours + descriptions
  tajweed/timing.ts        Experimental madd-timing from word timestamps
  transcribe/              Pluggable STT engine (Whisper default, swappable)
```

The speech engine is behind a `Transcriber` interface (`lib/transcribe`), so a
different backend can be dropped in without touching the alignment or tajweed
logic.

---

## Run it locally

```bash
npm install
cp .env.local.example .env.local   # add your OPENAI_API_KEY
npm run dev                        # http://localhost:3000
```

Then open the app, tap **Start reciting**, recite Surah Al-Fatiha, and tap stop.

> A microphone and an `OPENAI_API_KEY` are required for live recitation feedback.

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
