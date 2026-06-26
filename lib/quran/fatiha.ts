// Surah Al-Fatiha (1) — verified Uthmani text, word-by-word, with tajweed
// metadata. Each word carries the prominent tajweed rule(s) that apply to it so
// the UI can colour them and the timing engine can check elongations.
//
// Tajweed rule tags follow the common Mushaf colour conventions. They focus on
// the clearly-applicable, prominent rules in Al-Fatiha and can be extended.

import type { Ayah, RuleId, Surah, Word } from "./types";

// Re-export the shared types so existing imports from this module keep working.
export type { Ayah, RuleId, Surah, Word };
export { flattenWords } from "./types";

export const fatiha: Surah = {
  number: 1,
  name: "Al-Fatiha",
  nameArabic: "ٱلْفَاتِحَة",
  bismillah: false, // the bismillah IS the first ayah of Al-Fatiha
  ayat: [
    {
      number: 1,
      translit: "Bismi llāhi r-raḥmāni r-raḥīm",
      translation: "In the name of Allah, the Most Gracious, the Most Merciful.",
      words: [
        { uthmani: "بِسْمِ", translit: "bismi", rules: [] },
        { uthmani: "ٱللَّهِ", translit: "llāhi", rules: ["lam_jalalah", "madd_natural"], madd: "natural" },
        { uthmani: "ٱلرَّحْمَٰنِ", translit: "r-raḥmāni", rules: ["sun_letter", "madd_natural"], madd: "natural" },
        { uthmani: "ٱلرَّحِيمِ", translit: "r-raḥīm", rules: ["sun_letter", "madd_natural"], madd: "natural" },
      ],
    },
    {
      number: 2,
      translit: "Al-ḥamdu lillāhi rabbi l-ʿālamīn",
      translation: "All praise is due to Allah, Lord of all the worlds.",
      words: [
        { uthmani: "ٱلْحَمْدُ", translit: "al-ḥamdu", rules: ["moon_letter"] },
        { uthmani: "لِلَّهِ", translit: "lillāhi", rules: ["lam_jalalah", "madd_natural"], madd: "natural" },
        { uthmani: "رَبِّ", translit: "rabbi", rules: ["shaddah"] },
        { uthmani: "ٱلْعَٰلَمِينَ", translit: "l-ʿālamīn", rules: ["moon_letter", "madd_natural"], madd: "natural" },
      ],
    },
    {
      number: 3,
      translit: "Ar-raḥmāni r-raḥīm",
      translation: "The Most Gracious, the Most Merciful.",
      words: [
        { uthmani: "ٱلرَّحْمَٰنِ", translit: "r-raḥmāni", rules: ["sun_letter", "madd_natural"], madd: "natural" },
        { uthmani: "ٱلرَّحِيمِ", translit: "r-raḥīm", rules: ["sun_letter", "madd_natural"], madd: "natural" },
      ],
    },
    {
      number: 4,
      translit: "Māliki yawmi d-dīn",
      translation: "Master of the Day of Judgement.",
      words: [
        { uthmani: "مَٰلِكِ", translit: "māliki", rules: ["madd_natural"], madd: "natural" },
        { uthmani: "يَوْمِ", translit: "yawmi", rules: ["leen"] },
        { uthmani: "ٱلدِّينِ", translit: "d-dīn", rules: ["sun_letter", "madd_natural"], madd: "natural" },
      ],
    },
    {
      number: 5,
      translit: "Iyyāka naʿbudu wa-iyyāka nastaʿīn",
      translation: "You alone we worship, and You alone we ask for help.",
      words: [
        { uthmani: "إِيَّاكَ", translit: "iyyāka", rules: ["shaddah", "madd_natural"], madd: "natural" },
        { uthmani: "نَعْبُدُ", translit: "naʿbudu", rules: [] },
        { uthmani: "وَإِيَّاكَ", translit: "wa-iyyāka", rules: ["shaddah", "madd_natural"], madd: "natural" },
        { uthmani: "نَسْتَعِينُ", translit: "nastaʿīn", rules: ["madd_natural"], madd: "natural" },
      ],
    },
    {
      number: 6,
      translit: "Ihdinā ṣ-ṣirāṭa l-mustaqīm",
      translation: "Guide us to the straight path.",
      words: [
        { uthmani: "ٱهْدِنَا", translit: "ihdinā", rules: ["madd_natural"], madd: "natural" },
        { uthmani: "ٱلصِّرَٰطَ", translit: "ṣ-ṣirāṭa", rules: ["sun_letter", "tafkheem", "madd_natural"], madd: "natural" },
        { uthmani: "ٱلْمُسْتَقِيمَ", translit: "l-mustaqīm", rules: ["moon_letter", "madd_natural"], madd: "natural" },
      ],
    },
    {
      number: 7,
      translit: "Ṣirāṭa lladhīna anʿamta ʿalayhim ghayri l-maghḍūbi ʿalayhim wa-lā ḍ-ḍāllīn",
      translation:
        "The path of those You have blessed — not of those who earned Your anger, nor of those who went astray.",
      words: [
        { uthmani: "صِرَٰطَ", translit: "ṣirāṭa", rules: ["tafkheem", "madd_natural"], madd: "natural" },
        { uthmani: "ٱلَّذِينَ", translit: "lladhīna", rules: ["sun_letter", "madd_natural"], madd: "natural" },
        { uthmani: "أَنْعَمْتَ", translit: "anʿamta", rules: ["izhar"] },
        { uthmani: "عَلَيْهِمْ", translit: "ʿalayhim", rules: ["leen"] },
        { uthmani: "غَيْرِ", translit: "ghayri", rules: ["leen"] },
        { uthmani: "ٱلْمَغْضُوبِ", translit: "l-maghḍūbi", rules: ["moon_letter", "tafkheem", "madd_natural"], madd: "natural" },
        { uthmani: "عَلَيْهِمْ", translit: "ʿalayhim", rules: ["leen"] },
        { uthmani: "وَلَا", translit: "wa-lā", rules: ["madd_natural"], madd: "natural" },
        { uthmani: "ٱلضَّآلِّينَ", translit: "ḍ-ḍāllīn", rules: ["sun_letter", "tafkheem", "madd_lazim"], madd: "lazim" },
      ],
    },
  ],
};
