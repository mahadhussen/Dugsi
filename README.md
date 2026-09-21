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
5. **Listen to the whole Quran, in your Sheikh's voice.** Pick from a range of
   beloved qaris (Alafasy, Al-Husary, Abdul Basit, Al-Minshawi, As-Sudais, …)
   and press play: Dugsi recites the surah verse by verse and flows straight
   into the next one, so you can listen to the entire Quran hands-free. It hooks
   into the phone's Media Session, so the lock-screen and headphone controls
   (play / pause / skip) work too — handy while driving or with the screen off.
   Audio streams from the public everyayah.com archive at play time. Your chosen
   Sheikh is remembered on the device and used everywhere audio plays.
6. **Prayer times for Göteborg + adhan.** A dedicated page shows today's times
   (Fajr, Shuruq, Dhuhr, Asr, Maghrib, Isha) with the next prayer and a live
   countdown, computed **on-device** with the Muslim World League method and the
   "one-seventh of the night" high-latitude rule — the same method as
   [salatgbg.se](https://salatgbg.se), so it stays accurate through Sweden's
   bright summer nights, offline and server-free. A built-in adhan player lets
   you choose a call-to-prayer recording and listen whenever you like.

7. **Live mistake detection.** While you recite, skipped words turn grey and
   substituted words red the moment the recogniser is sure you moved on; added
   words are counted in a running tally. It is deliberately conservative (a
   word is only flagged once a later word clearly matched), a re-read word turns
   green again, and the full alignment at the end has the final say. Can be
   switched off under *Goals & reminders → Reciting* for positive-only marking.
8. **Memorisation (Hifz) tools.** Three hiding levels; hidden words reveal as
   you recite them correctly. Stuck? **Peek next word** or **Peek verse** (peeks
   are counted per attempt, so the summary stays honest), or tap any hidden
   word. Transliteration and translation hide with the words so nothing gives
   them away. Long surahs can be practised a **verse range** at a time, with
   ◀ ▶ to step to the next range.
9. **Mistake history.** Every word you slip on is saved, with what you said
   instead. Per surah (with *You* vs *Correct* playback) and across all surahs
   on the progress page, most frequent first, each with a one-tap **Practise**
   that opens exactly that verse.
10. **Your recordings.** Every recitation is recorded on the device. The
    *Recordings* tab lists them per surah with playback at 0.75× / 1× / 1.25×,
    download and delete. Audio never leaves the device.
11. **Analytics dashboard** (`/progress`). Current and best streak, minutes
    recited (today / week / all time), verses covered, score trend, minutes per
    day against your goal, a 16-week activity calendar, all-time word totals,
    and per-surah mastery with verses mastered.
12. **Goals.** Minutes per day, recitations per day, verses per week and verses
    memorised per month, each with a progress bar. Editable with +/−.
13. **Study reminders.** A daily reminder at your time (and chosen weekdays):
    a system notification while Dugsi is open or installed to the home screen,
    plus an **.ics calendar file** with a repeating alarm for when it is not — a
    static site has no push server, and we say so instead of pretending.
14. **Bookmarks.** Mark any verse while reading; the list on the progress page
    jumps straight back to it.
15. **Local-first, cloud-synced.** All of the above works signed out, stored in
    this browser. Sign in and history, goals, settings and bookmarks sync to
    the account and merge across devices (each session carries a client id so
    nothing is counted twice). Recordings stay on the device by design.
16. **Installable.** A web manifest and a tiny service worker let Dugsi be
    added to the home screen like an app.

The areas each live on their own page — **Recitera** (`/`), **Lyssna**
(`/listen`), **Framsteg** (`/progress`) and **Bönetider** (`/prayer`) — reached
from a slide-out side menu, so the flows never get in each other's way.

Deep links open the reader at a place: `/?surah=2&verse=255` scrolls to a
verse, `/?surah=2&from=1&to=5` practises a range.

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
  page.tsx                 Recite: recorder + surah + tajweed legend
  listen/page.tsx          Listen: full-Quran player + read-along
  progress/page.tsx        Analytics dashboard, mistakes, recordings, goals
  prayer/page.tsx          Prayer times (Göteborg) + adhan
components/
  AppNav.tsx               Slide-out side menu across all pages
  AppServices.tsx          Sign-in sync, service worker, reminder timer
  Reciter.tsx              On-device recognition + live marking + results UI
  QuranTrainer.tsx         Surah picker, verse range, deep links
  VerseRange.tsx           Practise a verse range of a long surah
  SurahView.tsx            Ayah rendering with tajweed colours / result overlay
  BookmarkButton.tsx       Per-verse bookmark toggle
  ProgressPanel.tsx        Compact "today" card on the home page
  ProgressDashboard.tsx    The /progress page (tabs)
  GoalsPanel.tsx           Goal bars + editing
  ReminderSettings.tsx     Notification + calendar reminders
  MistakesPanel.tsx        All-time most-missed words
  RecordingsPanel.tsx      Your recordings: play / download / delete
  SurahMasteryList.tsx     Per-surah mastery + mistake review
  charts/                  Streak calendar, score trend, minutes per day
  ReciterPicker.tsx        Choose which Sheikh (qari) to listen to
  ListenPlayer.tsx         Hands-free full-Quran player (auto-advance + MediaSession)
  ListenView.tsx           The /listen page: pickers + player + read-along
  PrayerView.tsx           Prayer times, next-prayer countdown (client, live)
  AdhanPlayer.tsx          Choose and play a call-to-prayer recording
  PlayButton.tsx           Per-verse listen button (uses the chosen Sheikh)
  Legend.tsx               Tajweed colour key
lib/
  history.ts               Local-first session history + cloud merge/sync
  settings.ts              Goals, reminder and reciting settings (synced)
  bookmarks.ts             Verse bookmarks (synced, with tombstones)
  reminders.ts             Reminder timer, notifications, .ics export
  live.ts                  Live tracking + mistake detection + sticky merge
  recordings.ts            On-device recordings (IndexedDB), bounded
  audio-quran.ts           Reciter catalogue + per-ayah audio URLs (everyayah.com)
  reciter-store.ts         Shared, persisted "current Sheikh" choice
  prayer-times.ts          On-device prayer times (adhan lib, MWL + 1/7-night)
  adhan-audio.ts           Adhan recording catalogue
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
live mistake detection, history merging, stats aggregation, reminder scheduling
and the .ics file, end-to-end scoring, and Quran text integrity (canonical
match + checksum).

### Database (accounts)

`supabase/schema.sql` is idempotent — re-run it in the Supabase SQL editor
after pulling. It adds the richer session columns (`client_id`, `seconds`,
`verses`, `from_verse`, `to_verse`, `extra`, `peeks`, `hifz`), the
`user_settings` table and the `bookmarks` table. Until it is run the app falls
back to the old shape automatically (nothing breaks, sessions just carry less
detail in the cloud).

---

## Roadmap

- Quran-tuned acoustic model + real phonetic tajweed (makharij, ghunnah,
  qalqalah) beyond the current madd-timing heuristic.
- Listen-then-recite drill loops per verse (play the qari, recite, auto-check,
  advance on three clean passes).
- Real push reminders if the project ever gets a (free) backend worker.
