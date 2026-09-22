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
