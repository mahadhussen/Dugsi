# Dugsi — Quran Recitation & Tajweed Trainer

Recite the Quran aloud and get **instant, word-by-word feedback** on your
accuracy and tajweed. A free, open alternative to paid recitation apps — built
to be honest about what it can and can't yet verify.

**Surahs:** Al-Fatiha (1, with full per-word tajweed) and Al-Baqarah (2, 286
verses, practised in short sections). Pick a surah and, for long ones, a
verse range to recite. More surahs slot in via the same verified-data pipeline.

---

**Free for everyone. No API key, no server, no cost, no tracking.** All the
word-checking is plain JavaScript that runs client-side, so the app is a static
site anyone can host for free. Recognition runs in the browser two ways:
**High accuracy** (on-device Whisper) keeps audio entirely on the device;
**Fast** uses the browser's built-in Web Speech API, which in some browsers
(e.g. Chrome) transcribes audio in the cloud. We store nothing but a local
reading-progress marker.

## What it does today

1. **Recitation accuracy.** You recite into the mic; your Arabic is recognised
   on-device, then each spoken word is aligned against the verified Uthmani text
   of Al-Fatiha using diacritic-insensitive fuzzy matching. Every word is marked
   **correct / close / needs-work / skipped**.
2. **Two free voice engines (pick per recitation):**
   - **Fast** — the browser's built-in recogniser. Instant, zero download.
   - **High accuracy** — a real **Whisper** model running on-device via
     `transformers.js` (loaded from a CDN the first time, then cached/offline).
     Better at classical Arabic, and it returns **word-level timestamps**.
3. **Acoustic madd-timing (High-accuracy mode).** Using Whisper's word
   timestamps, Dugsi estimates whether your elongations were held long enough and
   flags rushed ones (⏱) — e.g. the 6-count madd in *aḍ-ḍāāāllīn*.
4. **Tajweed guide.** The surah is rendered with colour-coded tajweed rules
   (madd, sun/moon letters, leen, lām of Allah, tafkhīm, …) to learn as you read.

### Quran text integrity

The Al-Fatiha text is verified two ways in CI (`test/quran-integrity.test.ts`):
a word-by-word comparison against an independent canonical reference, and a
pinned SHA-256 checksum of the exact diacritic text. The religious text cannot
change silently — any edit fails the build until the checksum is reviewed and
updated.

### Honest limits

- Recognition is general-Arabic, not Quran-specialised, so it can still misread
  classical Arabic — a word marked wrong may be the recogniser, not the reciter
  (High-accuracy mode reduces this).
- Madd-timing is a timestamp **heuristic**, not a phonetic measurement. It flags
  obviously rushed elongations; it does not judge makharij or ghunnah quality.
- High-accuracy mode downloads a model on first use (needs internet once), and is
  slower on older phones. Fast mode is always available as a fallback.
- Needs **Chrome** (desktop/Android) or **Safari** (iOS). Firefox isn't supported.
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
  analyze.ts               Orchestrates alignment + timing + scoring (client-side)
  audio.ts                 Decode recorded audio → mono 16 kHz PCM for Whisper
  speech/recognizer.ts     Web Speech API wrapper (Fast engine)
  speech/whisperLocal.ts   On-device Whisper via transformers.js (High accuracy)
  tajweed/rules.ts         Rule colours + descriptions
  tajweed/timing.ts        Madd-timing engine (Whisper word timestamps)
```

Recognition + analysis both run in the browser, so the deployed app needs no
backend and no secrets. `transformers.js` is loaded from a CDN at runtime only
when High-accuracy mode is chosen, so it never bloats the bundle.

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
end-to-end scoring, and Quran text integrity (canonical match + checksum).

---

## Roadmap

- Scale content to more surahs from a verified dataset, each locked by checksum.
- Quran-tuned acoustic model + real phonetic tajweed (makharij, ghunnah,
  qalqalah) beyond the current madd-timing heuristic.
- Live word highlighting while reciting (streaming).
- Progress tracking and memorisation (hifz) mode.
