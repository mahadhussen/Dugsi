# Dugsi — mål i ordning

Byggs uppifrån. En skiva är klar först när den kör och dess tester passerar.
Mahads ordning 2026-10-25: först Tarteel-läsningen, sedan lyssning, markering
och sparande.

## S0 — Grund (klar när dokumenten finns och före-beviset är fångat)
- [x] ARCHITECTURE.md, GOALS.md, WORKLOG.md med tre kritikrundor
- [x] Före-bevis: modellens laddning, glapp mellan suror, gammal spårare

## S1 — Följaren (ren kärna)
- [ ] Viktad fonetisk likhet, sammanslagning och delning av ord
- [ ] Semi-global justering och omsynk (missad aya, hopp, upprepning, inledning)
- [ ] Reducer med bästa försök, `unclear` för oförklarade luckor
- [ ] Slutdom med konfidensgrind och typade fel
- [ ] Tester mot riktiga modelltranskriptioner

## S2 — Lyssnaren (mikrofon till text på enheten)
- [ ] Segmenter (paus, max 12 s, tvekan, auto-stopp) med tester på riktigt ljud
- [ ] ASR-worker med Tarteel whisper-tiny-ar-quran, WebGPU eller WASM
- [ ] Reciteringsmotorn med explicita tillstånd
- [ ] Eval-skript: hela kedjan på riktiga ljudfiler

## S3 — Recitera i appen
- [ ] Reciter använder motorn: live-följning, ohört grått, dom utan väntan
- [ ] Sparas för alla (utloggade också), fel med typ
- [ ] Silero VAD och den trasiga modellkonfigurationen bort
- [ ] Prövad i webbläsaren med riktigt ljud via falsk mikrofon

## S4 — Lyssna utan glapp
- [ ] mp3quran aya-tider: tolkning, cache, koppling shejk → inspelning
- [ ] Helsura-läge i motorn, nästa sura värms upp
- [ ] Spelknappen byts aldrig mot snurra
- [ ] Aya för aya: nästa aya hämtas till minnet i förväg
- [ ] Mätt i webbläsaren: inget glapp vid aya- och surabyten

## S5 — Klicka och markera
- [ ] Aya-meny: lyssna härifrån, aya, upprepa, recitera härifrån, från/till
- [ ] Intervall med upprepning (1, 3, 5, oändligt)
- [ ] Markera text → lyssna på markerat

## S6 — Sparande som förstår felen
- [ ] Härledda svaga ställen per ord och aya, feltyp, förväxlade ayat, tvekan
- [ ] Repetition (Leitner) och "dags att repetera"
- [ ] Svaga ställen med Lyssna och Öva

## S7 — Granskning och leverans
- [ ] Kräsen, Heisenberg mot BOB, Naadir CLEAN
- [ ] README, THIRD_PARTY och /about uppdaterade
- [ ] PR med före- och efter-bevis
