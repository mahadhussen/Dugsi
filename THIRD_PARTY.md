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

## Typeface and page layout

| Source | Used for | Licence / terms | Obligations we meet |
|---|---|---|---|
| [King Fahd Glorious Qur'an Printing Complex](https://fonts.qurancomplex.gov.sa/) — *KFGQPC HAFS Uthmanic Script* v0.13 (`app/fonts/UthmanicHafs1Ver13.ttf`, SHA-256 `5e3147…81e84`, copied byte for byte from [mustafa0x/qpc-fonts](https://github.com/mustafa0x/qpc-fonts) @ `8a4f39d`) | The Quran text typeface, so every letter and mark reads as in the printed Madinah mushaf | Embedded EULA: "Permission is hereby granted, Free of Cost, to any person obtaining a copy of this Font … the rights to Use, Copy, Distribute", provided the font is not sold, modified, altered, translated, reverse engineered, decompiled or disassembled | Shipped unmodified (Next.js only copies the file under a hashed name); never sold; credited on `/about` |
| King Fahd Complex — Word document of the Hafs mushaf (`UthmanicHafs v22.docx`, same repository) | The 604-page, 15-line page layout in `lib/quran/layout/` (which word sits on which line), rebuilt with `scripts/build-mushaf-layout.py` | The Complex distributes its mushaf text files for free use; only the line and page positions are derived, the words shown are Dugsi's own corpus | Credited on `/about`; the document itself is not redistributed |

## Audio and timing data

| Source | Used for | Licence | Obligations |
|---|---|---|---|
| [EveryAyah.com](https://everyayah.com) | Verse audio for every Sheikh (streamed at play time, never copied or re-hosted; a listener may save a surah into their own browser cache for offline listening, as any web page is cached) | Free public archive | Attribution |
| [MP3Quran.net](https://mp3quran.net) | Whole-surah recordings plus verse timings from their documented `ayat_timing` API (33 Sheikhs, fixed recording ids in `lib/listen/surah-timing.ts`), so a surah plays as one file with no pause between verses; and Sheikhs never published ayah by ayah (Al Zain Mohammad Ahmad). Read and streamed in the listener's browser, never copied or re-hosted | Free public archive | Attribution |
| [cpfair/quran-align](https://github.com/cpfair/quran-align) | Word-level timestamps for Alafasy, Husary Muallim, Shuraim, Minshawi (`lib/quran/timings/`) | CC BY 4.0 | Attribution on `/about`; only ayat whose segmentation matched our text were kept (≈99%). Sudais data in the release is corrupt and was skipped; reciters whose EveryAyah bitrate differs from ours were skipped too, so timings always match the audio we play |

## Speech and AI models (all run on the device)

| Source | Stars | Used for | Licence |
|---|---|---|---|
| [openai/whisper](https://github.com/openai/whisper) | ~97k | Speech recognition family | MIT |
| [tarteel-ai/whisper-tiny-ar-quran](https://huggingface.co/tarteel-ai/whisper-tiny-ar-quran) | — | The listening model while reciting (on the device), through the community ONNX export [`Sharjeelbaig/whisper-tiny-ar-quran-onnx`](https://huggingface.co/Sharjeelbaig/whisper-tiny-ar-quran-onnx) pinned to revision `cd93bde`; graphs used: `encoder_model.onnx` (SHA-256 `f0c604c7…c5b5c8`) and `decoder_model_merged_quantized.onnx` (`06a5c440…f652`) | Apache-2.0 |

| [rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final](https://huggingface.co/rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final) | — | The vowel model on a computer (on the device): scores each short vowel against the audio, `lib/follow/vowel-judge.ts`. Through the community 4-bit ONNX export [`mostafanewir70/quran-recitation-ctc-onnx`](https://huggingface.co/mostafanewir70/quran-recitation-ctc-onnx) pinned to revision `f90650a`; graph used: `onnx/model_q4.onnx` (SHA-256 `9b17e04f…1845a587`). Base: `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` ← `facebook/wav2vec2-large-xlsr-53` | Apache-2.0 |
| Its `quran_text.txt` (same repository, revision `b03a268`) | — | The Quran with full vowel marks in the spelling the model was trained on; split into words, unchanged, in `lib/quran/ctc/*.json` (`scripts/build-ctc-text.ts`). Never shown, only scored against | Apache-2.0 (repository); the text itself appears to be Tanzil's simple script, used verbatim |

Replaced 2026-10-25 and why (measured, see `WORKLOG.md`): `YunusZJ/whisper-base-ar-quran-ONNX` could not load (no fp16 decoder, a 315 MB "quantised" one), so the app silently fell back to general `Xenova/whisper-tiny`, which cannot hear Quran ("المستطيع" for "المستقيم"). Silero VAD and `@ricky0123/vad-web` are gone: the pause detector in `lib/listen/segmenter.ts` gives hesitations and auto-stop, and a second ONNX runtime on the page went with them.

## Libraries loaded at runtime from a CDN

| Source | Stars | Licence |
|---|---|---|
| [huggingface/transformers.js](https://github.com/huggingface/transformers.js) | ~16k | Apache-2.0 |
| [microsoft/onnxruntime](https://github.com/microsoft/onnxruntime) (onnxruntime-web) | ~15k | MIT |

## npm dependencies

Next.js (MIT), React (MIT), Tailwind CSS (MIT), react-virtuoso (MIT),
@supabase/supabase-js (MIT), adhan (MIT). Amiri font via Google Fonts (SIL OFL 1.1) for
UI Arabic and as the fallback while the Complex's typeface loads; Nunito via Google
Fonts (SIL OFL 1.1) for the interface.

## Things we looked at and did not use

- **quran/quran_android** (GPL-3.0): copying code would force Dugsi under GPL.
- **quran.com API v4**: requires OAuth client credentials and terms of use; not needed since the text is shipped.
- **Bernström Swedish translation** (in fawazahmed0/quran-api): copyrighted, no redistribution licence. Zetterstéen (d. 1953) is public domain but was not vetted for text quality yet.
- **KFGQPC per-page QCF fonts** (one font per mushaf page): same licence as the text font, but 604 files; the text font plus the printed line layout gives the same page without the download.

## Recommendation for this repository's own licence

The repository has no `LICENSE` file, which legally means "all rights reserved"
by the author. If you want others to be able to use or contribute, add an MIT
licence (compatible with everything above). That is your decision as the owner.
