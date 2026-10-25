# Dugsi — arkitektur

Låst 2026-10-25 för bygget "ny Tarteel-läsning, glappfri lyssning, djupare sparande".
Gäller före äldre beskrivningar i README där de säger emot. Koden och kommentarerna
är på engelska, planeringsdokumenten på svenska.

## Grundlagar

1. **Fel dom är värre än ingen dom.** Dugsi säger aldrig att någon läst fel när
   systemet inte är säkert. Osäkert blir "kunde inte höra", aldrig rött.
2. **En deterministisk kärna äger varje dom.** Vilka ord som är rätt, fel,
   överhoppade eller ohörda bestäms av rena, testade funktioner i `lib/follow/`.
   Taligenkänningen levererar bara text; den dömer aldrig själv.
3. **En sanningskälla per sak.** Korantexten (`lib/quran/data`, låst med SHA-256),
   spårarens tillstånd (en reducer), historiken (en logg), uppspelningens läge
   (en motor). Vyer härleds, aldrig parallella kopior.
4. **Allt på enheten.** Inget eget backend. Ljudet lämnar inte enheten i
   Quran-modellens väg. Webbläsarens taltjänst (som i Chrome går via Google) är
   bara en ledtråd för markören, och används som domare endast när modellen inte
   kan köras, med samma konfidensgrind som förut.

## Recitera (Tarteel-läsningen)

```
mikrofon ─► AudioWorklet (16 kHz mono) ─► Segmenter (pauser, max 15 s)
                │                              │ stängt segment / öppet segment
                │                              ▼
                │                     ASR-worker: Tarteel whisper-tiny-ar-quran
                │                     (WebGPU-kodare om möjligt, annars WASM)
                │                              │ text + ordtider
                ▼                              ▼
          MediaRecorder              Follower (ren reducer, lib/follow)
          ("hör dig själv")      ◄── ledtrådar från webbläsarens taltjänst
                                               │
                                               ▼
                               Dom med konfidensgrind ─► historik (alla, även utloggad)
```

- `lib/follow/phonetic.ts` — normalisering och viktad likhet (långa vokaler,
  ljudlika bokstäver billiga), sammanslagning och delning av ord.
- `lib/follow/align.ts` — semi-global justering av ett segment mot ett fönster av
  texten, och omsynk via bigram-index när fönstret inte räcker (missad aya,
  hopp, upprepning).
- `lib/follow/follower.ts` — reducern. Varje segment (slutgiltigt eller
  preliminärt) är en händelse. Ordets status är det bästa av alla försök
  (rätt > nästan > fel > överhoppad). Mellanrum som modellen inte kan förklara
  blir `unclear`, inte `missing`. Inledning (isti'adha, basmala) och avslutning
  ("sadaqa Allahu l-azim") tolereras.
- `lib/follow/lexicon.ts` — är det hörda ett ord ur Koranen alls? Stavningsnyckeln
  för varje ord i Uthmani och modern stavning (`lexicon-data.json`, byggd av
  `scripts/build-lexicon.ts`, kontrollerad mot texten i test). "Fel ord" kräver
  ett annat Koranord; bokstäver som inte är något ord är "kunde inte höra".
- `lib/follow/verdict.ts` — slutdomen: poäng, sammanfattning, konfidensgrind,
  fellista med typ (fel ord, överhoppat, förväxlad aya, upprepat och rättat,
  tvekan). Ger samma `RecitationFeedback` som resultatpanelen redan visar.
- `lib/listen/segmenter.ts` — ren tal/paus-detektor över 16 kHz-ramar med
  adaptiv brusnivå. Ger också tvekan (paus > 2,5 s mitt i) och auto-stopp,
  så Silero VAD och dess andra ONNX-runtime tas bort.
- `public/asr-worker.js` — laddar transformers.js 3.3.3 och modellen från CDN
  (fast revision), avkodar ett segment i taget. Ett segment är högst 15 s och en
  ihopslagen omavkodning högst 18 s; långa bitar (Al-Fatiha som en 46 s bit) är
  där modellen tappar hela ayat (uppmätt).
- `lib/listen/recite-engine.ts` — tjänstelagret som kopplar ihop mikrofon,
  segmenter, worker, ledtrådar och follower, med explicita tillstånd
  (idle → starting → listening → finishing → done).

Modell: `tarteel-ai/whisper-tiny-ar-quran` (Apache-2.0, 7 % WER) via
ONNX-exporten `Sharjeelbaig/whisper-tiny-ar-quran-onnx` på fast revision.
Kodaren körs i fp32 (den kvantiserade kraschar, ConvInteger saknas), avkodaren i q8.
Cirka 67 MB, hämtas en gång och cachas. Den allmänna whisper-tiny tas bort som
reserv: den hör "المستطيع" för "المستقيم" och skulle döma fel.

## Lyssna (shejken)

En motor, `lib/listen-engine.ts`, två lägen som väljs per shejk:

- **Hel sura** (förval när det finns): en mp3-fil per sura från mp3quran.net
  plus deras dokumenterade aya-tider (`/api/v3/ayat_timing`). Ett enda
  ljudelement, så det blir inget glapp mellan ayat på någon enhet, och låst
  skärm fungerar. Hoppa till en aya, upprepa en aya eller ett intervall görs
  genom att söka i filen.
- **Aya för aya** (everyayah): för shejker utan tidsatt helsura, och för
  ord-för-ord-följning där quran-align-tider finns. Nästa aya hämtas med
  `fetch` till minnet i förväg, eftersom iPhone ignorerar förladdning.

Spelknappen byts aldrig mot en snurra. Laddning visas bredvid.
Vid surans slut värms nästa surafil upp i förväg och spelningen fortsätter själv.

Loopar (från–till, antal, stopp eller fortsätt) bor i motorn själv; de
mättes i webbläsaren och i BOB:s ljudattrapp, inte i enhetstester.
Underkänns en suras aya-tider (Hudhaify, vissa Al-Fatiha-filer) spelas den aya
för aya från everyayah i stället.

## Klicka och markera

- Tryck på en aya-markör: i Lyssna läser shejken därifrån, i Recitera just
  den ayan (med sin egen röst även för helsura-shejker).
- "Repeat a passage" under spelaren: ayat från–till, 1/3/5/7 gånger eller
  tills stopp, sedan vidare.
- Markera text med fingret eller musen: "Hear verses a–b" (eller ×3) spelar
  de ayat som markeringen täcker.
- Varje fel i historiken har Lyssna och Öva, som öppnar just det stället.

## Sparande

- Varje tillförlitligt försök sparas lokalt för alla, inte bara inloggade
  (felet på `Reciter.tsx:679` rättas), och synkas som förut när man är inloggad.
- Fel sparas med typ och stabil nyckel (sura, aya, ordindex) i den befintliga
  `mistakes`-kolumnen (jsonb), bakåtkompatibelt, ingen migration.
- `lib/memory/` (ren) härleder svaga ställen: per ord och aya hur ofta, vilken
  sorts fel, vad du sa i stället, förväxlade ayat, tvekan, och när det är dags
  att repetera (Leitner-lådor). Rättat i senare försök räknas ner.

## Testning

- Modellens riktiga utdata på 145 inspelningar (mästare, rätta läsningar, en
  vers överhoppad, ett ord utbytt) räknas i `test/corpus.verdict.test.ts`: falska
  anklagelser mot ett tak som bara får sänkas.
- Rena kärnor har enhetstester mot facit: follow (`test/follow.test.ts`),
  segmentern, sammanslagningsregeln (`test/policy.test.ts`), svaga ställen
  (`test/weak-spots.test.ts`) och aya-tidernas tolkning
  (`test/surah-timing.test.ts`, mot sparade svar från mp3quran).
- Riktiga transkriptioner från modellen (Alafasy, Husary, syntetiska fel med
  överhoppad aya, fel ord, upprepning) ligger som fixturer, så spåraren prövas mot
  modellens faktiska utdata och inte mot påhittad text.
- `scripts/eval/transcribe.ts` kör segmenter → modell på riktiga ljudfiler i
  Node och skriver fixturer; `scripts/eval/follow.ts` skriver domen för varje
  fixtur. Körs för hand, inte i CI.
