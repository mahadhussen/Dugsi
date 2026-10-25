// Is what the model wrote a word of the Quran at all?
//
// A reciter who says the wrong word nearly always says another word of the
// Quran (a verse that resembles this one, a word from elsewhere). What the
// model writes when it fails is often no word at all: a word cut in two by a
// pause ("ولغر" for "وَلَا ٱلضَّ…"), letters run together, a near-spelling
// ("العمسان" for "ٱلْإِنسَٰنَ"). So "said another word" is only claimed when
// what was heard is a word — otherwise it was not heard clearly.
//
// The list holds the spelling key (lib/follow/spelling.ts) of every word of
// the text in Uthmani and in modern spelling: lib/follow/lexicon-data.json,
// built by scripts/build-lexicon.ts, checked against the text by
// test/lexicon.test.ts.

import keys from "./lexicon-data.json";
import { spellingKey } from "./spelling";

const known = new Set<string>(keys as string[]);

/** True when `heard` (a normalised token) is a word of the Quran, in either spelling. */
export function isQuranWord(heard: string): boolean {
  const k = spellingKey(heard);
  return k.length > 0 && known.has(k);
}
