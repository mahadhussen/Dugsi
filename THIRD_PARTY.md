# Third-party data, models and libraries

Everything Dugsi is built from, what it is used for, and the licence it comes
under. Reviewed 2026-09 when the recitation-analysis features were built. The
same list is shown to users at `/about`.

Rule of thumb applied: only permissive licences (MIT, Apache-2.0, ISC, OFL,
CC BY) or public archives with attribution. **No GPL/AGPL code** is copied into
this repository (for example `quran/quran_android` is GPL-3.0 and was looked at
only for ideas, never code). **No copyrighted translation** is added beyond the
one already shipped (Saheeh International, used unmodified and non-commercially
with attribution); the Swedish Bernström translation is copyrighted and was
deliberately *not* added.

## Quran text and translation

| Source | Used for | Licence / terms | Obligations we meet |
|---|---|---|---|
| [Tanzil Project](https://tanzil.net) | Transliteration, Saheeh International translation (via quran-json) | CC BY 3.0, text may not be modified, must link to tanzil.net | Verbatim text, attribution + link on `/about` |
| [The Noble Qur'an Encyclopedia](https://quranenc.com) | Uthmani text, Hafs (via quran-json) | Free with attribution | Attribution on `/about`; corpus locked by SHA-256 in CI |
| [risan/quran-json](https://github.com/risan/quran-json) | JSON packaging | MIT | Attribution |
| Saheeh International | English translation | © Abul-Qasim Publishing; distributed by Tanzil for non-commercial use | Non-commercial app, unmodified, attributed |

## Audio and timing data

| Source | Used for | Licence | Obligations |
|---|---|---|---|
| [EveryAyah.com](https://everyayah.com) | Verse audio for every Sheikh (streamed at play time, never copied) | Free public archive | Attribution |
| [cpfair/quran-align](https://github.com/cpfair/quran-align) | Word-level timestamps for Alafasy, Husary Muallim, Shuraim, Minshawi (`lib/quran/timings/`) | CC BY 4.0 | Attribution on `/about`; only ayat whose segmentation matched our text were kept (≈99%). Sudais data in the release is corrupt and was skipped; reciters whose EveryAyah bitrate differs from ours were skipped too, so timings always match the audio we play |

## Speech and AI models (all run on the device)

| Source | Stars | Used for | Licence |
|---|---|---|---|
| [openai/whisper](https://github.com/openai/whisper) | ~97k | Speech recognition family | MIT |
| [tarteel-ai/whisper-base-ar-quran](https://huggingface.co/tarteel-ai/whisper-base-ar-quran) | — | Quran-tuned recognition (via the community ONNX export `YunusZJ/whisper-base-ar-quran-ONNX`) | Apache-2.0 |
| [Xenova/whisper-tiny](https://huggingface.co/Xenova/whisper-tiny) | — | Light general model / fallback | MIT |
| [snakers4/silero-vad](https://github.com/snakers4/silero-vad) | ~10k | Voice activity detection (hesitations, auto-stop) | MIT |

## Libraries loaded at runtime from a CDN

| Source | Stars | Licence |
|---|---|---|
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | ~16k | Apache-2.0 |
| [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) (onnxruntime-web) | ~15k | MIT |
| [ricky0123/vad](https://github.com/ricky0123/vad) (@ricky0123/vad-web) | ~2k | ISC |

## npm dependencies

Next.js (MIT), React (MIT), Tailwind CSS (MIT), react-virtuoso (MIT),
@supabase/supabase-js (MIT), adhan (MIT). Amiri font via Google Fonts (SIL OFL 1.1).

## Things we looked at and did not use

- **quran/quran_android** (GPL-3.0): copying code would force Dugsi under GPL.
- **quran.com API v4**: requires OAuth client credentials and terms of use; not needed since the text is shipped.
- **Bernström Swedish translation** (in fawazahmed0/quran-api): copyrighted, no redistribution licence. Zetterstéen (d. 1953) is public domain but was not vetted for text quality yet.
- **KFGQPC Uthmanic fonts**: licence restricts redistribution; Amiri (OFL) is used instead.

## Recommendation for this repository's own licence

The repository has no `LICENSE` file, which legally means "all rights reserved"
by the author. If you want others to be able to use or contribute, add an MIT
licence (compatible with everything above). That is your decision as the owner.
