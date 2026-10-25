# Dugsi — arbetslogg

## NEEDS-DECISION

1. **Ord-för-ord under lyssning för fler shejker.** Quran.com har sammanhängande
   surafiler med tider per ord för 14 shejker (`api.qurancdn.com`, öppen CORS),
   men det är deras interna API utan publicerade villkor för tredje part. Därför
   används det inte. Med det skulle ord-för-ord och glappfritt gå att få samtidigt.
   Mahads beslut.
2. **Hur Mahad provar på telefonen.** GitHub Pages är produktion (allt på `main`
   deployas). Alternativ: (a) lokal https-server på wifi, (b) förhandsdeploy på
   Vercel, (c) merga. Ingen deploy görs utan ja.

## 2026-10-25 — Naadirs NOT CLEAN: villkor 1–4 och efterpunkterna

Naadir dömde NOT CLEAN med fyra villkor. Vart och ett är rättat och bevisat:

1. **En härledning av ordstatus.** `judgeWords` i `lib/follow/verdict.ts` ger
   status för varje ord; live-markeringen (`liveMarks`) och domen använder samma
   funktion. Bevis: Naadirs livediff ger 0 avvikelser över 17 inspelningar (12
   fixturer och hans 5 TTS-prov).
2. **Fel ord vid aya-kanten fångas, utan att en rätt läsning anklagas.**
   Al-Asr 3:9 (بالحق), Al-Baqarah 5:8 (الخسرون) och Al-Ikhlas 2:2 (الوحد) blir
   fel med hört ord. Samma röst som läser rätt får inga fel, och felläsningen
   får alltid lägre poäng (89 mot 95, 93 mot 96). Proven ligger nu som fixturer
   (`tts-asr*`, `tts-ikhlas*`, `tts-baqarah-khasirun`) med tester. Tre regler:
   - Likhet: en artikel som båda orden har räknas inte ("الواحد" och "الصمد" är
     inte 60 % lika), artikeln före en solbokstav är tyst ("سمد" för "الصمد"), och
     ljudlika bokstäver (ص/س, د/ت, ط/ت, ض/د, ذ/ز/ظ, ق/ك, ح/ه) kostar halvt.
   - Att lämna läsarens plats (bakåt eller förbi ord) kräver två klart hörda ord.
     Annars, när bitens första ord är textens nästa ord, fortsätter läsaren där.
   - "Nästan rätt" ger delpoäng lika med likheten, och 100 kräver att varje ord
     satt. Beslut: likheten som delpoäng. Alternativ: halv poäng (gav 93 mot 93
     i Al-Ikhlas-paret), eller räkna nästan rätt som rätt (döljer slarv).
     Sammanfattningen säger nu "N words nearly right".
3. **`stop` läser aktuell `wordOffset`** (beroendet tillagt). Bevis:
   eslint-plugin-react-hooks 5.1 (körd utanför repot) ger 0 fynd om beroenden i
   allt grenen ändrat. Två äldre fynd ligger i filer som är oförändrade mot main.
4. **Facit för aya-tiderna:** `test/surah-timing.test.ts` mot sparade svar från
   mp3quran (Alafasy 112 och 1, Hudhaify 112 numrerad 0..3 underkänns), plus
   0..6-skiftet i Al-Fatiha, fallande och nollånga tider. Sabotageprov: tre
   avsiktliga fel i tolkningen fälls var för sig. `test/policy.test.ts` för
   sammanslagningsregeln. ARCHITECTURE.md säger nu exakt vilka tester som finns.

Efterpunkterna:

- En bit som modellen skrev tom för, med minst 0,3 s röst, gör glappet ohört i
  stället för överhoppat (55:64 مدهامتان, ett ord). Utan röst är det fortfarande
  överhoppat.
- Avkodningskön trimmas bara medan modellen laddas ner. Förut kunde en långsam
  telefon tappa bitar mitt i, och orden i dem blev överhoppade.
- Spelaren efter nätfel: stannar, visar spela, och ett tryck laddar om (bevisat i
  ljudattrappen: förut visade knappen paus och ett tryck pausade bara).
- iPhone utan WebGPU får en sann text i stället för "modellen är avstängd i
  Options".

Känt och oförändrat (mätt mot läget före): Al-Baqarah 1–120 i andetag om 3 ord
lämnar 151 överhoppade ord ofångade (de blir ohörda, aldrig fel). "يجادلون" för
"يخادعون" blir nästan rätt, inte fel. Heisenbergs fall H gäller den gamla
motorn som tappade misslyckade bitar; i dag blir de ohörda.

## 2026-10-25 — Bygget, skiva för skiva

- S1 `92574a6` följaren, S2–S3 `f0bcea7` modellen live, S4–S5 `3f05f85` lyssning
  utan glapp, S6 `f9c696a` svaga ställen, docs `2a72d8f`.
- Beslut: helsura-läget är förval för de 33 shejker som har tidsatt helsura hos
  mp3quran. Det kostar ord-för-ord-markering under lyssning för Alafasy, Husary
  (muallim), Shuraim och Minshawi (hela ayan lyser i stället). Skäl: Mahads
  klagomål var pausen; ord-för-ord kräver filbyten per aya. Alternativ: se
  NEEDS-DECISION 1.
- Beslut: klipp vid pauser 300 ms (inte 380): längre gav fler kapningar mitt i
  ord hos Alafasy. Madd-svansar hanteras med ihopslagen omavkodning i stället.
- Beslut: madd döms bara för madd lazim, och bara under halva längden (ordtider
  för grova för 2 takter, mätt).
- Känd gräns (mätt): telefonbandsfiltret i stresstestet tar bort s-ljudet i
  بِسْمِ och ger ett fel ord; en webbläsarmikrofon har fullt band.
- Känd gräns: provat i Chrome på Mac med falsk mikrofon och dold panel; iPhone och
  Android är inte provade här.
- `next lint` saknar ESLint-konfiguration i repot (CI kör den inte); inte skapad.

## 2026-10-25 — Före bygget: läget, mätt

Utgångspunkt: `origin/main` @ `38d2b06` (PR #6). Den lokala utcheckningen i
`~/Projekt/Dugsi` låg tre PR:er efter och har en ocommittad ändring i
`package.json` (transformers.js som npm-beroende). Den är orörd; bygget sker i
worktree `~/Projekt/dugsi-tarteel` på grenen `feat/tarteel-lasning`.

Mätt, inte antaget:

| Vad | Resultat |
|---|---|
| Appens Quran-modell med grafikkort (`YunusZJ/...-ONNX`, fp16) | `decoder_model_merged_fp16.onnx` ger 404. Laddningen faller, märks som trasig i 7 dagar, appen använder allmän whisper-tiny |
| Samma modell utan grafikkort (q8) | Avkodaren är 315 MB |
| Allmän whisper-tiny på Alafasy, Al-Fatiha | "إياكنا أمولوائياكنا استعيين … الصراق المستطيع" |
| Allmän whisper-tiny på Husary, Al-Ikhlas | "قريهم أن الله أحد … كفوان أحد" |
| Tarteel whisper-tiny-ar-quran på Husary, Al-Ikhlas | ord för ord rätt |
| Samma på Alafasy med telefonfilter, brus och 12 % snabbare | ord för ord rätt (utom "إذ دنا" för "اهدنا") |
| Samma på hel sura som en bit (27 s) | tappade aya 2, "الرحمن" dubblerat. Korta bitar per paus tappar inget |
| Syntetiskt överhoppat ord (لله) | fångas, modellen hittar inte på ordet |
| Syntetiskt fel ord, upprepad aya | fångas respektive syns tydligt |
| Fart i webbläsaren, 6 s aya | grafikkort + WASM-avkodare 0,7 s, bara WASM 1,6 s |
| Ordtider från modellen mot Quran.com, 1:1 | inom ett par hundradelar |
| Shejk, aya-byte i Chrome på dator | 0 ms (förladdning fungerar här) |
| Shejk, surabyte Al Zain (helsura) | 335 ms tystnad och snurra i stället för spelknapp, på fast nät |
| Kod: förladdning på iPhone | `preload="auto"` ignoreras av iOS, nästa aya laddas först vid bytet |
| Kod: spelknappen | byts mot snurra vid `waiting` = "startknappen försvinner" |
| Kod: sparande | `logSession` anropas bara med `userId`, utloggade sparar inga fel |
| Kod: live-spåraren | ser bara 6 ord framåt och kliver ett ord per två missar, och tappar ord när webbläsarens taltjänst startar om vid en paus |
| Ordindelning Quran.com mot vår text | 28 av 6 229 ayat avviker (Alafasy) |
| mp3quran aya-tider | 115 inspelningar av hela suror med tider per aya, dokumenterat, CORS öppet |

## 2026-10-25 — Tre kritikrundor innan bygget

Plan 1 var: Quran-modellen i en worker, ljudet klipps vid pauser, en ny följare,
dom direkt efter sista pausen, shejken från en fil per sura, aya-meny och
markering, sparande för alla med typade fel.

### Runda 1 — sanning (kan Dugsi döma fel?)

1. Preliminära avkodningar av ett öppet segment klipper mitt i ett ord (uppmätt:
   "الدار" för ett halvt "الدين"). → De flyttar bara markören framåt, sista ordet
   kastas, de dömer aldrig.
2. Modellen kan tappa en hel aya inne i en lång bit (uppmätt). → Segment högst
   15 s (12 s kapade Al-Fatihas sista aya mitt i madden). En lucka på 4 ord eller mer inne i ett segment blir `unclear`. En hel
   aya blir "överhoppad" bara när ingen oförklarad röst finns mellan segmenten.
3. Upprepning (uppmätt) får inte räknas som tillagda ord. → Bästa försöket per
   ord gäller, rättelsen sparas som "rättat".
4. Basmala och isti'adha före suran kan få följaren att hoppa till 27:30. →
   Inledningen känns igen och konsumeras.
5. Modellen skriver harakat men de jämförs inte. → Dugsi dömer ord, inte vokaltecken,
   och säger det.
6. Allmän whisper-tiny som reserv dömer fel. → Bort. Utan Quran-modell används
   webbläsarens taltjänst med samma konfidensgrind som förut, och det står vilken.
7. Modellen ligger i någon annans HF-repo. → Fast revision, Apache-2.0 krediteras,
   försvinner den faller appen tillbaka till webbläsarens taltjänst.
8. mp3quran-tiderna har en "aya 0" (inledning) och kan vara trasiga. → Tolkas och
   kontrolleras (ökande, rätt antal; loopens slut kläms till filens längd),
   annars spelas suran aya för aya. (Rättat efter granskning: först fanns ingen
   reserv.)
9. Att matcha shejk på namn kan ge fel röst. → Varje shejk kopplas till ett
   bestämt läsnings-id, bara Hafs.

### Runda 2 — robusthet (telefon, nät, minne, två körningar)

1. Silero VAD laddar en egen ONNX-runtime bredvid transformers.js. → Silero bort,
   segmentern ger tvekan och auto-stopp.
2. iOS dödade fliken vid avkodning av hela inspelningen. → Ingen avkodning av
   hela inspelningen längre, högst 12 s åt gången, kraschskyddet behålls.
3. Långsam enhet hinner inte med. → Avkodningstiden mäts; hinner den inte slås
   preliminära avkodningar av och resten avkodas efter stopp med förlopp.
4. Worker med CDN-import under `/Dugsi` på GitHub Pages. → Sökväg via
   `NEXT_PUBLIC_BASE_PATH`.
5. Låst skärm: rAF stannar, så upprepning av ett intervall skulle löpa förbi. →
   `timeupdate` (ca 4 gånger i sekunden) som reserv. Ingen extra timer.
6. Byte av sura på iPhone: samma ljudelement återanvänds (upplåst vid första
   trycket), nästa fil laddas 25 s före slut.
7. Spara sura för offline måste fungera i helsuraläget. → Samma cache, tiderna
   cachas också.
8. Start två gånger, stopp mitt i laddning, byte av sura mitt i. → Motorn har
   explicita tillstånd och avbryter gammalt arbete med token.

### Runda 3 — omfattning och vad Mahad kommer att säga

1. Allt på en gång blir halvbyggt. → Skivor S1–S7 i Mahads ordning, varje skiva
   körd och testad före nästa.
2. "Den hänger inte med." → Missas en aya hoppar markören dit du är inom en sekund
   efter nästa paus, och den missade ayan blir grå med "lyssna/recitera igen",
   inte röd.
3. "Startknappen försvinner." → Knappen finns alltid, laddning visas bredvid.
4. "Pausen mellan ayat." → Helsura-läget har inga filbyten inne i en sura. Det mäts
   i webbläsaren, och det sägs rakt ut att iPhone-beteendet bara kan bekräftas på en
   iPhone.
5. Ord-för-ord under lyssning försvinner för fyra shejker om helsura blir förval.
   → Ord-för-ord behålls för dem i aya-för-aya-läget; för de andra lyser hela ayan.
   Quran.com-alternativet ligger som beslut ovan.
6. Ingenting som fungerar idag får gå sönder: dölj ord och titta, tajweed,
   bokmärken, djuplänkar, inspelningar, "Correct"-klipp, madd-tid, statistik, mål,
   synk, offline, låsskärm, Al Zain, bönetider.
7. Hela skärmen-principen: mushaf-sidan är papper (undantaget), resten är redan
   fullbredd på telefon. Ingen omdesign i detta bygge.
8. "Klart" sägs inte före Naadirs CLEAN.

Plan 3 = ARCHITECTURE.md och GOALS.md.
