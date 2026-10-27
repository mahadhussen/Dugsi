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
3. **Ska ett ljudlikt bokstavsbyte synas?** ح för ه, ص för س, ق för ك: i dag
   blir ordet "nästan rätt" (gult, delpoäng, sparas inte som fel), aldrig
   "rätt" och aldrig "fel". Modellen kan inte skilja elevens makhraj från sin
   egen stavning. Alternativ: (a) som nu, (b) inte visa alls (räkna som rätt),
   (c) räkna som fel (anklagar rätt läsning när modellen stavar fel). Följd av
   (a): korta ord som قل/كل blir också "nästan rätt" (34 ordformer). Mahads beslut.
4. **Får ett hört ord på högst två bokstäver kallas fel?** ("من", "لم", "لا").
   Uppmätt: av 20 falska fel på 40 färska rätta läsningar är 10 sådana, och 1 av
   2 hos de försämrade mästarna. Inget av de 48 riktiga felen som fångades i
   felkorpusen var så kort, men den korpusen saknar byten mellan korta ord, och
   "من" för "ما" eller "لم" för "لن" är klassiska elevfel. Alternativ: (a) som
   nu, korta ord kan bli fel, (b) korta ord blir "kunde inte höra" (halverar de
   falska felen och missar elevens korta byten). Mahads beslut.
5. **Ska poängen spegla ohörda ord?** I dag räknas de inte: Al-Fatiha med 6 av
   29 ord mumlade till icke-ord får 90, samma som perfekt (rutan "Not heard 6"
   syns). Alternativ: (a) som nu, (b) ohörda ord drar ned poängen (en mumlare
   får lägre poäng, men också den som läser i brus eller med dålig mikrofon).
   Mahads beslut.
6. **Får ett överhoppat ord på högst två bokstäver ("لا", "من", "في") dömas
   överhoppat?** I dag aldrig inne i en bit: modellen tappar sådana ord i
   sammanhängande tal ("fil-arḍ"). Uppmätt: utan regeln blir 1 av 40 färska
   rätta läsningar felaktigt "överhoppad", med regeln fångas 0 av 154 verkligt
   överhoppade korta ord (syntetiskt prov, Naadir), förut 92. Alternativ:
   (a) som nu, aldrig, (b) döm dem som andra ord (fler falska överhopp när
   modellen tappar ett kort ord). Beslutet togs av mig i runda 4 utan att
   läggas här; det är Mahads.
8. **Vokalmodellen på telefon.** Den nya vokalmodellen (241 MB) körs bara på
   dator. På telefon dömer lyssningsmodellen vokalerna som förut (fångar ungefär
   hälften). Skälet: en iPhone-flik som håller för mycket laddas om, och det är
   inte prövat på en riktig telefon. Prov utan risk för andra: öppna sidan en
   gång med `?vowels=on` (`?vowels=off` stänger). Laddas sidan om medan den kör
   stängs den av igen på den telefonen, utan att räknas mot lyssningsmodellen.
   Alternativ: (a) som nu, dator först, (b) på för alla telefoner, (c) på för
   telefoner med WebGPU efter Mahads prov. Mahads beslut, gärna efter provet.
7. **Hur strängt ska ordslut (kasusändelser) dömas?** Vokalfel i ordslut
   (rabbu för rabbi, māliku för māliki) fångas till 67 %, men det är där
   modellen gör flest egna vokalfel på rätt läsning (Qahtani "الرَّحْمَنُ",
   "أَنْعَمْتُ" i brus/eko). Uppmätt på domnivå: falska vokalfel 0,05 % av orden
   hos Majed, 0,2 % hos rena mästare, 0,7–1,3 % i försämrat ljud. Alternativ:
   (a) som nu, ordslut döms (utom före en paus), (b) bara vokaler inne i ord
   (fångar 44 %, nästan inga falska), (c) ordslut visas som "kolla slutet"
   utan att räknas som fel. Mahads beslut.
   *Uppdatering runda 6:* med vokalmodellen (dator) fångas ordslut 26 av 29
   och inne i ord 22 av 27, utan falsklarm hos 14 mästare. Frågan gäller nu
   främst telefonen (NEEDS-DECISION 8).

## 2026-10-27 — Runda 6: en andra modell dömer vokalerna efter ljudet (dator)

Mahad: "inte helt godkänt … allt en person läser ska systemet känna av". Den
gamla vokaldomen jämför vokaler som Whisper skrev, och Whisper drar det den
hör mot texten (tränad bara på rätt läsning): 27 av 49 avsiktliga fel.

- **Prövat först:** tvingad vokalpoäng med Whisper själv (sannolikheten för
  textens vokaler mot en ändrad vokal, givet ljudet): 29 av 49, samma
  systematiska falsklarm (Qahtani الرَّحْمَنُ). Ingen verklig vinst.
- **Valt:** en CTC-modell utan språkmodell,
  `rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final` (Apache-2.0), som
  skriver alla vokaltecken. Den skeppas som 4-bitarsexporten
  `mostafanewir70/quran-recitation-ctc-onnx` (241 MB, fast revision,
  SHA-256 kontrollerad). Domen är aritmetik i `lib/follow/vowel-judge.ts`:
  marginal = hur mycket bättre ljudet passar ordet med en annan vokal; > 5 är
  fel vokal. Python-mätningen och TypeScript ger samma tal (facittest).
- **Fem fällor som mättes fram och stängdes:**
  1. Fel facittext (basmala med fast shejken inte läste den) gav marginaler
     8–12 på ord som aldrig sades. → Domen sker i det hördas sammanhang: målet
     är de hörda orden, där hörda ord som är textord skrivs som texten har dem.
     Med medvetet fel facittext (isti'adha + basmala alltid): 0 larm.
  2. Modellen skriver shadda före vokalen; omvänd ordning sänkte träffarna
     (الشَّمْسُ 1,7 → 11,9 med rätt ordning).
  3. Krav på exakt lika bokstäver tappade 13 riktiga fel (ett vokalfel ändrar
     stavningen: فِيهَ hörs فِيهَا). → Likhet ≥ 0,7 (0,75 tappade tre, 0,6 parade
     ett ekande "أو" med أعوذ, marginal 4,5).
  4. Två ord som modellen skrev ihop ("نَسْتَعِياهْدِنَا") parades med det första;
     det andra ordets ljud fick ordslutet att se fel ut (10,9 på Alafasy). → Ett
     hört ord som är två textord ihop paras inte.
  5. Kort stopp vid versslut: "i" i nästa verss "ihdinā" togs för ordslutet i
     نَسْتَعِينُ (7,3 på Fares Abbad). → Ett verss sista ordslut döms aldrig, som
     i `harakat.ts`.
- **Mätt med den skeppade kedjan** (`scripts/eval/vowels.ts`, 4-bitarsmodellen
  genom transformers.js + appens domare):
  - 56 avsiktliga fel (Majed, inne i ord och i ordslut, Al-Fatiha, Al-Ikhlas,
    Al-Falaq, An-Nas, Al-Asr, Al-Kawthar, Al-Baqarah 2–5): **48 fångade**
    (86 %). Missarna: två ord som modellen skrev ihop med nästa (då döms de
    inte), ett ord med för olik stavning, resten där modellen hörde textens
    vokal (talsyntesen kan ha sagt rätt). Den gamla domen på första 49-satsen:
    27. Två larm, båda "الصَّلَاةَ" i 2:3: talsyntesen säger "-tu" (åtta mästare
    som läser 2:3 ger 0 larm, 64 ord).
  - 14 mästare, Al-Fatiha och Al-Ikhlas: **0 larm på 547 bedömda ord.**
  - Eko, brus och telefon (fem mästare): **0 larm på 555 ord.**
  - Minshawy "Teacher" (barn upprepar efter läraren): 1 larm på 36 ord, på
    upprepningen av يَلِدْ. Redovisas för sig, ingen ren läsning.
  - I appen (webbläsaren, låtsasmikrofon): Al-Fatiha med tre vokalfel → alla
    tre fångade ("wrong vowel: you said الْحَمْدَ"); mästarens rätta Al-Fatiha
    → 100, 29 av 29. Varje bit döms 1–4 s efter att lyssningsmodellen placerat
    den.
- **Hamza:** Mahads eget fel i إِلَيْكَ fångas i alla tolkningar: إِلُيْكَ (6,9),
  أُلَيْكَ (9,4), أَلَيْكَ (10,9); "wa-'adhā" för وَإِذَا (13). Rätt läsning av
  samma vers: marginaler kring −12.
- **Fart:** 0,1–0,16 s arbete per sekund ljud på processorn (Node). Motorn
  dömer varje placerad bit när lyssningsmodellen är ledig; vid stopp väntar
  den in resten (högst 60 s).
- **I appen:** finns vokalmodellens bok i följarens tillstånd dömer bara den
  vokaler; Whispers vokalgissningar används inte. Den laddas på dator när läs-
  vyn visas; statusraden i den hopfällda panelen säger hur långt den kommit.
  Telefon: se NEEDS-DECISION 8.
- **Texten:** varje Uthmani-ord i modellens stavning (`lib/quran/ctc/*.json`,
  byggd av `scripts/build-ctc-text.ts` ur modellens egen quran_text.txt). 77 429
  ord parade; 371 Uthmani-ord är två eller tre modellord (يَٰقَوۡمِ = يَا قَوْمِ).
  En billig sammanslagning parade en gång إِلَّا med اللَّائِي (58:2); nu kostar
  sammanslagning mer än ett ords skillnad. Testet går igenom alla ord.
- **Lärdom:** datorn startades om mitt i och /tmp tömdes (modeller, ljud,
  skript). Mätverktygen ligger nu i repot (`scripts/eval/vowels.ts`,
  `scripts/eval/make-vowel-corpus.ts`) och data i `.eval/` (ignoreras av git).

## 2026-10-26 — Mahads test 3: vokalfel och mikrofonpanelen

Mahad läste med flit fel vokal (damma för kasra) och Dugsi sa rätt; "om den
inte kan fånga upp såna misstag så är hela appen helt misslyckad". Och
mikrofonpanelen täckte texten.

- **Mätt först:** modellen skriver vokalerna som sägs. Alla 12 avsiktliga fel i
  ett första prov kom med i texten (الْحَمْدَ, رَبُ, مَالِكُ, نَعْبَدُ, إِلُوَّكَ …).
  Dugsi jämförde bara bokstäver, så vokalerna kastades. Felet var vårt.
- **`lib/follow/harakat.ts`:** kort vokal mot annan kort vokal på samma konsonant,
  bara där modellen skrivit ett tecken. Aldrig shadda eller sukun (modellen
  tappar shadda på rätt läsning), aldrig ordslut före en paus (waqf), aldrig
  vokalen före en lång vokal (där gör modellen egna fel: Sudais "اهْدِنُوا").
  و och ي räknas som samma plats (ي efter fel vokal låter و).
- **Domen:** ett ord med rätt bokstäver men fel vokal blir gult ("wrong vowel:
  you said مَالِكُ (damma, the text has kasra)"), med Correct/You bredvid.
- **Mätt:** 49 avsiktliga vokalfel (Majed, `corpus/vowel`): 11/25 inne i ord och
  16/24 i ordslut fångas, 0 falska i samma läsningar. Missarna är ord som
  modellen stavat med andra bokstäver (då jämförs inte vokalerna). Falska
  vokalfel på rätt läsning har egna tak per korpus; bokstavstaken är
  oförändrade. I webbläsaren: Al-Fatiha med tre vokalfel → två fångade.
- **Två avkodningar** (med och utan 0,25 s tystnad före) prövades för att sila
  bort modellens egna vokalfel: de är systematiska (kommer i båda), så det
  hjälper inte.
- **Panelen:** en liten flytande pill (mikrofon/stopp, tid, "mer"); dölj ord, live-
  raden och vad som lyssnar öppnas på begäran. Texten är fri under läsning.

## 2026-10-26 — Mahads test 2: krasch på iPhone, rösten "hörs inte", mjukt grönt

Mahad: sidan laddas om på iPhone (Chrome) när han väljer sura; på datorn
verkar rösten inte läsas av; han vill att det gröna följer honom mjukt, gult
vid fel, grått vid överhoppat.

- **iPhone:** att sidan laddas om är iOS som dödar fliken för minne (alla
  webbläsare där delar Safaris motor och tak). Modellen låg kvar i minnet
  resten av besöket så fort Recitera visats. Nu på iPhone/iPad: laddas först
  vid tryck på mikrofonen, släpps (`asr.unload`, workern avslutas) när
  reciteringen stängs (annan sura, Lyssna, annan sida). Inte provat på en
  riktig iPhone.
- **Datorn:** produktionen fungerar med falsk mikrofon (Husary 112: 15/15).
  Två saker gjorde att det kändes dött: (1) ingenting syntes förrän en paus,
  för förhandsavkodningen startade först efter första biten; nu från början
  på grafikkort, var 0,9 s från 1,4 s öppen bit. (2) Kraschskyddet kunde
  stänga av modellen en vecka på en dator efter en omladdning under laddning
  (falsk krasch, hände i webbläsarpanelen). Nu gäller skyddet bara
  telefoner/surfplattor (test).
- **Mjukt flöde:** ord du passerat men som inte bedömts än lyser mjukt grönt
  ("reading"), ett ord i taget (70 ms steg), och sätter sig sedan: grönt rätt,
  gult fel, grått överhoppat, blekt ohört. Ringen runt mikrofonen följer
  rösten, så man ser att man hörs. Resultatrutor, räknare, inställningstext
  och README säger gult för fel.

## 2026-10-25 — Mahads test: hör ditt eget fel bredvid facit

Mahad provade och ville kunna välja exakt var det blev fel och höra just det:
facit och, bredvid, sitt eget fel som han läste det. Förut sparades bara den
senaste inspelningen per sura, så Fel-fliken kunde inte spela felet (bara
shejken), och en senare rätt läsning hade skrivit över det.

- `lib/recordings.ts`: varje recitation sparas som ett eget försök (IndexedDB
  v2, nyckel "sura:tid"), högst 30 försök och 80 MB, äldst först bort. Gamla
  inspelningar flyttas med vid uppgraderingen (provat i webbläsaren).
- Sessionen sparar vilket försök den hör till (`take`, bara lokalt, skickas
  inte till molnet).
- `HearChips` (MistakeReview.tsx): **Correct** (shejken säger just ordet, eller
  versen utan ordtider) och **You** (din röst vid ordet, i försöket där felet
  gjordes) sida vid sida, sedan **Verse**. Används i resultatpanelen och i
  Fel-fliken.
- Provat: "You" i Fel-fliken spelar 0,85–2,1 s av ett försök där ordet låg på
  1,0–1,8 s.

Krasch vid surabyte: går inte att framkalla i Chrome på datorn (Lyssna,
Recitera, under uppspelning, snabba byten, från sen vers till kort sura: 0
fel). Väntar på Mahads uppgifter om enhet och hur det ser ut.

## 2026-10-25 — Naadirs fjärde NOT CLEAN: röst som segmenteraren inte tog

Ny osedd uppsättning: 16 mästare under en annan läsares sorl (−12 dB), brunt
brus, tyst röst och rumsklang, samt 24 riktiga överhopp skurna ur mästarnas
rena inspelningar. Blockerande: när segmenteraren inte gör någon bit av rösten
(sorl, tyst insats) döms orden överhoppade (Sudais 1:5 och 1:6:1).

Regel: tystnaden mellan två bitar, utöver läsarens vanliga paus (medianen),
som rymmer minst halva de saknade ordens tid i läsarens takt gör glappet
ohört. Mätt på segmenterarens röstkarta, inte modellens ordtider (som går in i
varandra mellan bitar). Falska fall: 70–137 % av ordens tid. Riktiga överhopp:
högst 5 %.

| Mått | `281a3ec` | nu |
|---|---|---|
| 16 mästare i sorl/brus/tyst/rum: falska fel / överhopp | 3 / 7 | **3 / 0** |
| 24 skurna överhopp: versord / ord fångade, falska | 9/10 · 10/20, 1 | **9/10 · 10/20, 1** |
| övriga tal (alla korpusar, svep, recall) | – | oförändrade |

Testet för 55:64 ändrat: klicket låg i en tystnad lika lång som versen, vilket
nu läses som röst segmenteraren inte tog. Klicket ligger nu i en vanlig paus
(versen överhoppad, ska dömas överhoppad), och ett nytt fall visar en tystnad
lika lång som versen (ohört).

Öppet, inte blockerande: takt-regeln läser tajwid-förlängning som ohörd röst i
Naadirs syntetiska prov (långa överhoppade ord fångas 140/200, mål 190).
En fast andel av bitens tid som tolerans räcker inte (35 % klarar målet men ger
falska överhopp tillbaka redan vid 25 %). Nästa försök: tolerans efter läsarens
egen spridning i takt.

## 2026-10-25 — Naadirs tredje NOT CLEAN: färsk data jag inte sett

Naadir byggde ny data som reglerna inte trimmats mot: 18 försämrade
mästarläsningar (eko, brus, rum, 32 kbit/s), 40 Majed-läsningar på 20 andra
suror, 10 ord för ord, 17 ord för ord med en vers överhoppad, 28 felläsningar
av nya slag. Ett blockerande fel: ord som modellen tappar ur hörd röst döms
överhoppade (Qahtani i rum, Sudais i brus, Qahtani med eko, Alafasy på 32 kbit/s).
Whisper sprider sina ordtider över ett tappat ord, så det syns aldrig som en
lucka i tiden. Datan ligger nu i `test/fixtures/recite/corpus/` (fem nya mappar)
med tak i `test/corpus.verdict.test.ts`.

Tre nya belägg för ohörd röst (`runVerdict` i verdict.ts), var och en med test,
motprov och sabotageprov:

- **Läsarens egen takt:** sekunder röst per textbokstav, medianen över bitarna.
  En bit som håller mer röst än dess ord tar (minst halva det saknade ordens
  tid) kan ha hållit dem. Det fångar eko, rum och dålig linje.
- **Ett kort ord (högst tre bokstäver) som saknas intill ett otydligt hört ord:**
  modellen har dragit ihop dem ("معقد" för "مَا قَدَّمَتْ"). Bara ett kort ord:
  ett förvanskat ord rymmer inte ett långt ord eller en vers. Det bredare
  kravet (otydlig granne vid alla glapp) gav recall 50 → 21 och förkastades.
- **Ord på högst två bokstäver som saknas inne i en bit:** de smälter ihop med
  nästa i tal ("fil-arḍ").

| Mått (Naadirs kommandon) | `2da2aaf` | `3b3abd5` | nu |
|---|---|---|---|
| 18 försämrade mästare: falska fel / överhopp | 3 / 10 | 2 / 11 | **2 / 0** |
| 40 färska Majed: falska fel / överhopp | 38 / 33 | 20 / 17 | **20 / 0** |
| 10 färska ord för ord: falska | 0 | 0 | **0** |
| 17 färska ord för ord med överhopp: fångade av 73 / falska intill | 38 / 6 | 50 / 6 | **50 / 6** |
| 28 färska felläsningar: fångade / falska på andra ord | 5 / 7 | 10 / 4 | **12 / 3** |
| ord för ord med brus: falska överhopp / fångade av 122 | 11 / 27 | 0 / 98 | **0 / 98** |
| gamla korpusarna: mästare, Majed falska överhopp | 0, 26 | 0, 6 | **0, 0** |
| gamla överhoppskorpusen: fångade / falska utanför | 117 / 58 | 114 / 16 | **114 / 9** |

Ett test ändrat, med skäl: i tts-fatiha-wrong-word sade rösten "رب الناس" och
modellen skrev "ربياس". Testet godtog förut "överhoppat" för 1:2:4, men det var
en falsk dom, eftersom biten håller rösten för det utbytta ordet. Nu kräver
testet "fel" eller "kunde inte höra", och aldrig "överhoppat".

Artikelregeln gäller nu också efter و، ف، ب، ك، ل (وال، فال، بال، كال، لل),
med minst tre bokstäver efter. "والقمر" för "والشمس" blir fel, men "والاد" för
"والأرض" förblir modellens stavning. "Nästan rätt" för sådana byten: وال 19 % → 1,2 %,
بال 20 % → 1,0 %, فال 25 % → 2,5 %, لل 16 % → 3,1 % (Naadirs mål var 2 %. Kvar är
närbesläktade former som للذكر/للذكرين). Inga nya falska fel.

## 2026-10-25 — Naadirs andra NOT CLEAN: riktig modellutdata

Naadir körde modellen på 145 nya inspelningar (17 mästare, 54 rätta läsningar
med Majed-rösten, 24 med en överhoppad vers, 50 med ett utbytt ord) och fann att
förra rundans regler anklagade rätt läsning oftare: BOB:s svep körs med perfekt
text, där reglerna aldrig biter. Korpusarna ligger nu i
`test/fixtures/recite/corpus/` med `test/corpus.verdict.test.ts`, som räknar
falska anklagelser mot ett tak. Grönt kan inte längre betyda att mästare anklagas.

| Mått (Naadirs kommandon) | före rundan `2da2aaf` | `f4e54c3` | nu |
|---|---|---|---|
| 17 mästare: falska fel / falska överhopp | 4 / 0 | 8 / 0 | **1 / 0** |
| 54 rätta läsningar: falska fel / falska överhopp | 33 / 26 | 44 / 30 | **7 / 6** |
| 24 med vers överhoppad: falska anklagelser utanför versen | 58 | 71 | **16** |
| samma: överhoppade ord fångade (av 131) | 117 | 117 | 114 |
| 50 med ett ord utbytt: fångade / falska anklagelser | 17 / 23 | 48 / 22 | **48 / 2** |
| ljudlik bokstav lyfter ord från nästan rätt till rätt | 0 | 4 734 ordformer | **0** |
| Al-Fatiha med الرهمن ×4: poäng mot perfekt 90 | 76 | 90 | **88**, fyra nästan rätt |
| ord för ord, svep 112/101/77/36: falska överhopp | 4 | 13 | **0** |
| ord för ord, Ya-Sin 1–60 utan 36:12: falska / fångade | 81 / 0 av 14 | 82 | **0 / 14 av 14** |
| kantpar vid misslyckad bit, webbläsare, ohörd bit | ohörda | fel | **ohörda** |
| /quran första laddning | 254 kB | 254 kB | **233 kB** |

Reglerna, var och en med test och sabotageprov (elva sabotage, alla fälls):

- **"Fel" kräver att ett annat ord ur Koranen hördes** (`lib/follow/lexicon.ts`).
  Förvanskningar som "ولغر", "العمسان", "معصره" blir ohörda. Uppslaget är exakt
  på en stavningsnyckel (ordet utan alif och hamza) ur både Uthmani och modern
  stavning. Beslut: exakt nyckel. Förkastat: likhet mot ordlistan (gav
  "ولغر"≈"الغار", "سمت"≈"سموت"). Ett ord som modellen delat i två bedöms hopslaget.
  En stump på högst halva ordets längd ("لت" för "ليلة") är aldrig "fel".
- **Kantregeln:** ett fel ord vid en bits kant döms bara vid versens början
  eller slut, med grannbiten ren och utan klipp. Kostnad: ett fel ord just före
  en andningspaus mitt i en vers blir ohört.
- **Kantparen** följer samma skydd som resten av domen: modellens ordtider
  (inte webbläsarens), bitarna intill varandra, ingen bit emellan, inget klipp,
  pausen vid en versgräns.
- **Ljudlika bokstäver** ger högst "nästan rätt", aldrig "rätt". Se NEEDS-DECISION 3.
- **Artikeln:** ingen jämförelse utan artikel i likheten (gav falska fel på
  modellens stavning). Den delade artikeln räknas bort bara när det hörda är
  ett annat Koranord ("الواحد" för "الصمد"). Solbokstavsregeln kräver att resten
  är ett ord ("الله" är inte "ال" + "له").
- **Fortsätt-regeln** gäller bara när läsaren har börjat, bara bitar om minst två
  ord, bara ett-till-ett vid markören, och aldrig så att ett ord i biten hoppas
  över. Efter regeln nedan gör villkoret för första biten ingen mätbar skillnad.
  Det behålls enligt Naadirs krav och är testat direkt.
- **En dubbelplacering vittnar inte om överhopp:** en bit vars ord en annan bit
  också täcker (två ord eller mer, minst halva biten) gör glappet bredvid ohört
  (95:6, där modellen skrev versens slut för dess början).
- **En kort bit långt bort hålls kvar i stället för att kastas.** Om nästa bit
  fortsätter precis där, står båda (`held`/`confirmsHeld` i follower.ts). Fanns
  före rundan: ord för ord efter en överhoppad vers tappade följaren bort sig
  för resten av suran.
- **Recitera laddas vid behov** (`next/dynamic`), så att ordlistan (36 kB
  komprimerad) inte tynger läsning och lyssning.

Kända gränser, låsta med test: Qahtani 1,12× 1:2:2 ("الحمل لا يرب" för
"الحمد لله رب", ett riktigt ord för ett riktigt ord) och tts-fatiha 1:6:2
("اسرق", som är ett Koranord). Fler ord blir ohörda hos Majed (26→59). Det är
priset för att inte anklaga.

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
5. (Ändrat 2026-10-26, se nedan: vokaler döms nu.) Modellen skriver harakat men de jämförs inte. → Dugsi dömer ord, inte vokaltecken,
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
