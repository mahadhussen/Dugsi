# Dugsi — mål i ordning

Byggs uppifrån. En skiva är klar först när den kör och dess tester passerar.
Mahads ordning 2026-10-25: först Tarteel-läsningen, sedan lyssning, markering
och sparande.

## S0 — Grund (klar när dokumenten finns och före-beviset är fångat)
- [x] ARCHITECTURE.md, GOALS.md, WORKLOG.md med tre kritikrundor
- [x] Före-bevis: modellens laddning, glapp mellan suror, gammal spårare

## S1 — Följaren (ren kärna)
- [x] Viktad fonetisk likhet, sammanslagning och delning av ord
- [x] Semi-global justering och omsynk (missad aya, hopp, upprepning, inledning)
- [x] Reducer med bästa försök, `unclear` för oförklarade luckor
- [x] Slutdom med konfidensgrind och typade fel
- [x] Tester mot riktiga modelltranskriptioner

## S2 — Lyssnaren (mikrofon till text på enheten)
- [x] Segmenter (paus, max 15 s, tvekan, auto-stopp) med tester på riktigt ljud
- [x] ASR-worker med Tarteel whisper-tiny-ar-quran, WebGPU eller WASM
- [x] Reciteringsmotorn med explicita tillstånd
- [x] Eval-skript: hela kedjan på riktiga ljudfiler

## S3 — Recitera i appen
- [x] Reciter använder motorn: live-följning, ohört grått, dom utan väntan
- [x] Sparas för alla (utloggade också), fel med typ
- [x] Silero VAD och den trasiga modellkonfigurationen bort
- [x] Prövad i webbläsaren med riktigt ljud via falsk mikrofon

## S4 — Lyssna utan glapp
- [x] mp3quran aya-tider: tolkning, cache, koppling shejk → inspelning
- [x] Helsura-läge i motorn, nästa sura värms upp
- [x] Spelknappen byts aldrig mot snurra
- [x] Aya för aya: nästa aya hämtas till minnet i förväg
- [x] Mätt i webbläsaren: inget glapp vid aya- och surabyten

## S5 — Klicka och markera
- [x] Tryck på aya-markören: i Lyssna läser shejken därifrån, i Recitera just den ayan (egen röst)
- [x] Upprepa ett stycke: ayat från–till, 1/3/5/7 gånger eller tills stopp (mätt: 2–3 × 3, sedan vidare)
- [x] Upprepa: av / denna aya / hela suran (motorn klarar intervall och antal)
- [x] Markera text → "▶ Hear verses a–b" / ×3 (mätt: 2–3 lästes, sedan stopp)

## S6 — Sparande som förstår felen
- [x] Härledda svaga ställen per ord: hoppar över eller säger fel (och vad), rättat sedan
- [ ] Förväxlade ayat och tvekan in i minnet (domen hittar hopp och tvekan, de sparas inte ännu)
- [x] Repetition (Leitner) och "dags att repetera"
- [x] Svaga ställen med Lyssna och Öva

## S7 — Granskning och leverans
- [ ] Kräsen, Heisenberg mot BOB, Naadir CLEAN
- [x] README, THIRD_PARTY och /about uppdaterade
- [ ] PR med före- och efter-bevis
