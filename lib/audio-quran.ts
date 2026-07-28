// Reference recitation audio (a qari) per ayah, for listen-and-imitate learning
// and full-Quran listening. Served from everyayah.com (a long-standing public
// Quran audio archive). Audio loads on the user's device at play time — no
// build-time dependency and no bundle cost.

export interface Reciter {
  /** Stable id we persist as the user's choice. */
  id: string;
  /** English name shown in the picker. */
  name: string;
  /** Arabic name shown in the picker. */
  arabicName: string;
  /** everyayah.com data folder that holds this reciter's ayah files. */
  folder: string;
  /** Short note (style/quality) shown under the name. */
  note?: string;
}

// A curated set of widely-loved qaris. Every folder is a canonical everyayah.com
// path, so each ayah resolves to https://everyayah.com/data/<folder>/<sss><aaa>.mp3.
export const RECITERS: Reciter[] = [
  {
    id: "alafasy",
    name: "Mishary Rashid Alafasy",
    arabicName: "مشاري راشد العفاسي",
    folder: "Alafasy_128kbps",
    note: "Clear and widely loved",
  },
  {
    id: "husary",
    name: "Mahmoud Khalil Al-Husary",
    arabicName: "محمود خليل الحصري",
    folder: "Husary_128kbps",
    note: "Measured, classical tajweed",
  },
  {
    id: "husary_muallim",
    name: "Al-Husary (Muallim)",
    arabicName: "الحصري - المعلم",
    folder: "Husary_Muallim_128kbps",
    note: "Teaching style — great for learning",
  },
  {
    id: "abdulbasit",
    name: "Abdul Basit Abdus-Samad",
    arabicName: "عبد الباسط عبد الصمد",
    folder: "Abdul_Basit_Murattal_192kbps",
    note: "Murattal · timeless voice",
  },
  {
    id: "minshawi",
    name: "Mohamed Siddiq El-Minshawi",
    arabicName: "محمد صديق المنشاوي",
    folder: "Minshawy_Murattal_128kbps",
    note: "Murattal · deeply moving",
  },
  {
    id: "sudais",
    name: "Abdur-Rahman As-Sudais",
    arabicName: "عبد الرحمن السديس",
    folder: "Abdurrahmaan_As-Sudais_192kbps",
    note: "Imam of the Grand Mosque",
  },
  {
    id: "shuraim",
    name: "Saud Ash-Shuraim",
    arabicName: "سعود الشريم",
    folder: "Saood_ash-Shuraym_128kbps",
    note: "Imam of the Grand Mosque",
  },
  {
    id: "ghamdi",
    name: "Saad Al-Ghamdi",
    arabicName: "سعد الغامدي",
    folder: "Ghamadi_40kbps",
    note: "Warm and gentle",
  },
  {
    id: "basfar",
    name: "Abdullah Basfar",
    arabicName: "عبد الله بصفر",
    folder: "Abdullah_Basfar_192kbps",
  },
  {
    id: "ayyoub",
    name: "Muhammad Ayyoub",
    arabicName: "محمد أيوب",
    folder: "Muhammad_Ayyoub_128kbps",
    note: "Reciter of the Prophet's Mosque",
  },
  {
    id: "hudhaify",
    name: "Ali Al-Hudhaify",
    arabicName: "علي الحذيفي",
    folder: "Hudhaify_128kbps",
  },
];

export const DEFAULT_RECITER_ID = "alafasy";

export function getReciter(id: string | null | undefined): Reciter {
  return RECITERS.find((r) => r.id === id) ?? RECITERS[0];
}

/**
 * Absolute URL of one ayah's recitation. Pass a reciter id to pick the qari;
 * when omitted it falls back to the default (Alafasy).
 */
export function ayahAudioUrl(surah: number, ayah: number, reciterId?: string): string {
  const folder = getReciter(reciterId).folder;
  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  return `https://everyayah.com/data/${folder}/${s}${a}.mp3`;
}
