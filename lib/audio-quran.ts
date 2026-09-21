// Reference recitation audio (a qari) per ayah, for listen-and-imitate learning
// and full-Quran listening. Served from everyayah.com (a long-standing public
// Quran audio archive). Audio loads on the user's device at play time — no
// build-time dependency and no bundle cost.
//
// Every entry is a Hafs ʿan ʿĀṣim recording (the text Dugsi shows), so what you
// hear always matches what you read. Folder names are everyayah's own; the
// bitrate in the name is the recording quality.

export type ReciterStyle = "murattal" | "mujawwad" | "teaching";

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
  /** Recitation style: measured murattal, melodic mujawwad, or slow teaching. */
  style: ReciterStyle;
  /** Country the reciter is known from (for browsing). */
  country: string;
  /** Widely loved / a good first pick — shown first. */
  popular?: boolean;
  /** English Wikipedia article title, for a photo and a link. */
  wikipedia?: string;
}

// A curated set of widely-loved qaris. Every folder is a canonical everyayah.com
// path, so each ayah resolves to https://everyayah.com/data/<folder>/<sss><aaa>.mp3.
export const RECITERS: Reciter[] = [
  // ── Popular ──────────────────────────────────────────────────────────────
  {
    id: "alafasy",
    name: "Mishary Rashid Alafasy",
    arabicName: "مشاري راشد العفاسي",
    folder: "Alafasy_128kbps",
    note: "Clear and widely loved",
    style: "murattal",
    country: "Kuwait",
    popular: true,
    wikipedia: "Mishary_Rashid_Alafasy",
  },
  {
    id: "husary",
    name: "Mahmoud Khalil Al-Husary",
    arabicName: "محمود خليل الحصري",
    folder: "Husary_128kbps",
    note: "Measured, classical tajweed",
    style: "murattal",
    country: "Egypt",
    popular: true,
    wikipedia: "Mahmoud_Khalil_Al-Hussary",
  },
  {
    id: "husary_muallim",
    name: "Al-Husary (Muallim)",
    arabicName: "الحصري - المعلم",
    folder: "Husary_Muallim_128kbps",
    note: "Teaching style — great for learning",
    style: "teaching",
    country: "Egypt",
    popular: true,
    wikipedia: "Mahmoud_Khalil_Al-Hussary",
  },
  {
    id: "abdulbasit",
    name: "Abdul Basit Abdus-Samad",
    arabicName: "عبد الباسط عبد الصمد",
    folder: "Abdul_Basit_Murattal_192kbps",
    note: "Murattal · timeless voice",
    style: "murattal",
    country: "Egypt",
    popular: true,
    wikipedia: "Abdul_Basit_'Abd_us-Samad",
  },
  {
    id: "minshawi",
    name: "Mohamed Siddiq El-Minshawi",
    arabicName: "محمد صديق المنشاوي",
    folder: "Minshawy_Murattal_128kbps",
    note: "Murattal · deeply moving",
    style: "murattal",
    country: "Egypt",
    popular: true,
    wikipedia: "Mohamed_Siddiq_El-Minshawi",
  },
  {
    id: "sudais",
    name: "Abdur-Rahman As-Sudais",
    arabicName: "عبد الرحمن السديس",
    folder: "Abdurrahmaan_As-Sudais_192kbps",
    note: "Imam of the Grand Mosque",
    style: "murattal",
    country: "Saudi Arabia",
    popular: true,
    wikipedia: "Abdul_Rahman_Al-Sudais",
  },
  {
    id: "shuraim",
    name: "Saud Ash-Shuraim",
    arabicName: "سعود الشريم",
    folder: "Saood_ash-Shuraym_128kbps",
    note: "Imam of the Grand Mosque",
    style: "murattal",
    country: "Saudi Arabia",
    popular: true,
    wikipedia: "Saud_Al-Shuraim",
  },
  {
    id: "ghamdi",
    name: "Saad Al-Ghamdi",
    arabicName: "سعد الغامدي",
    folder: "Ghamadi_40kbps",
    note: "Warm and gentle",
    style: "murattal",
    country: "Saudi Arabia",
    popular: true,
    wikipedia: "Saad_Al-Ghamdi",
  },
  {
    id: "muaiqly",
    name: "Maher Al-Muaiqly",
    arabicName: "ماهر المعيقلي",
    folder: "Maher_AlMuaiqly_64kbps",
    note: "Imam of the Grand Mosque · calm",
    style: "murattal",
    country: "Saudi Arabia",
    popular: true,
    wikipedia: "Maher_Al_Muaiqly",
  },
  {
    id: "dossari",
    name: "Yasser Ad-Dossari",
    arabicName: "ياسر الدوسري",
    folder: "Yasser_Ad-Dussary_128kbps",
    note: "Imam of the Grand Mosque · emotive",
    style: "murattal",
    country: "Saudi Arabia",
    popular: true,
    wikipedia: "Yasser_Al-Dosari",
  },
  // ── Saudi Arabia ─────────────────────────────────────────────────────────
  {
    id: "hudhaify",
    name: "Ali Al-Hudhaify",
    arabicName: "علي الحذيفي",
    folder: "Hudhaify_128kbps",
    note: "Imam of the Prophet's Mosque",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Ali_Al-Hudhaify",
  },
  {
    id: "ayyoub",
    name: "Muhammad Ayyoub",
    arabicName: "محمد أيوب",
    folder: "Muhammad_Ayyoub_128kbps",
    note: "Imam of the Prophet's Mosque",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Muhammad_Ayyub_(imam)",
  },
  {
    id: "basfar",
    name: "Abdullah Basfar",
    arabicName: "عبد الله بصفر",
    folder: "Abdullah_Basfar_192kbps",
    note: "Steady, clear articulation",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Abdullah_Basfar",
  },
  {
    id: "shatri",
    name: "Abu Bakr Ash-Shatri",
    arabicName: "أبو بكر الشاطري",
    folder: "Abu_Bakr_Ash-Shaatree_128kbps",
    note: "Bright and melodic",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Abu_Bakr_al-Shatri",
  },
  {
    id: "ajmi",
    name: "Ahmed Al-Ajmi",
    arabicName: "أحمد العجمي",
    folder: "Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net",
    note: "Powerful, moving",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Ahmad_bin_Ali_Al-Ajmi",
  },
  {
    id: "budair",
    name: "Salah Al-Budair",
    arabicName: "صلاح البدير",
    folder: "Salah_Al_Budair_128kbps",
    note: "Imam of the Prophet's Mosque · gentle",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Salah_Al_Budair",
  },
  {
    id: "qasim",
    name: "Abdul Muhsin Al-Qasim",
    arabicName: "عبد المحسن القاسم",
    folder: "Muhsin_Al_Qasim_192kbps",
    note: "Imam of the Prophet's Mosque",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Abdulmohsen_Al-Qasim",
  },
  {
    id: "qatami",
    name: "Nasser Al-Qatami",
    arabicName: "ناصر القطامي",
    folder: "Nasser_Alqatami_128kbps",
    note: "Soft and heartfelt",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Nasser_Al_Qatami",
  },
  {
    id: "qahtani",
    name: "Khalid Al-Qahtani",
    arabicName: "خالد القحطاني",
    folder: "Khaalid_Abdullaah_al-Qahtaanee_192kbps",
    note: "Clear, unhurried",
    style: "murattal",
    country: "Saudi Arabia",
  },
  {
    id: "juhany",
    name: "Abdullah Awad Al-Juhany",
    arabicName: "عبد الله عواد الجهني",
    folder: "Abdullaah_3awwaad_Al-Juhaynee_128kbps",
    note: "Imam of the Grand Mosque",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Abdullah_Awad_Al_Juhany",
  },
  {
    id: "bukhatir",
    name: "Salah Bukhatir",
    arabicName: "صلاح بوخاطر",
    folder: "Salaah_AbdulRahman_Bukhatir_128kbps",
    note: "Warm, melodic",
    style: "murattal",
    country: "United Arab Emirates",
    wikipedia: "Salah_Bukhatir",
  },
  {
    id: "tunaiji",
    name: "Khalifa Al-Tunaiji",
    arabicName: "خليفة الطنيجي",
    folder: "khalefa_al_tunaiji_64kbps",
    note: "Calm and steady",
    style: "murattal",
    country: "United Arab Emirates",
  },
  {
    id: "jaber",
    name: "Ali Jaber",
    arabicName: "علي جابر",
    folder: "Ali_Jaber_64kbps",
    note: "Former imam of the Grand Mosque",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Ali_Jaber_(imam)",
  },
  {
    id: "abdulkareem",
    name: "Muhammad Abdul-Kareem",
    arabicName: "محمد عبد الكريم",
    folder: "Muhammad_AbdulKareem_128kbps",
    note: "Sudanese school · distinctive",
    style: "murattal",
    country: "Sudan",
  },
  // ── Egypt ────────────────────────────────────────────────────────────────
  {
    id: "husary_mujawwad",
    name: "Al-Husary (Mujawwad)",
    arabicName: "الحصري - مجوّد",
    folder: "Husary_128kbps_Mujawwad",
    note: "Slow, ornamented mujawwad",
    style: "mujawwad",
    country: "Egypt",
    wikipedia: "Mahmoud_Khalil_Al-Hussary",
  },
  {
    id: "abdulbasit_mujawwad",
    name: "Abdul Basit (Mujawwad)",
    arabicName: "عبد الباسط - مجوّد",
    folder: "Abdul_Basit_Mujawwad_128kbps",
    note: "The legendary mujawwad recordings",
    style: "mujawwad",
    country: "Egypt",
    wikipedia: "Abdul_Basit_'Abd_us-Samad",
  },
  {
    id: "minshawi_mujawwad",
    name: "El-Minshawi (Mujawwad)",
    arabicName: "المنشاوي - مجوّد",
    folder: "Minshawy_Mujawwad_192kbps",
    note: "Mujawwad · high quality",
    style: "mujawwad",
    country: "Egypt",
    wikipedia: "Mohamed_Siddiq_El-Minshawi",
  },
  {
    id: "minshawi_teacher",
    name: "El-Minshawi (Teacher)",
    arabicName: "المنشاوي - المعلم",
    folder: "Minshawy_Teacher_128kbps",
    note: "Teaching style with repetition",
    style: "teaching",
    country: "Egypt",
    wikipedia: "Mohamed_Siddiq_El-Minshawi",
  },
  {
    id: "tablawi",
    name: "Mohammad Al-Tablawi",
    arabicName: "محمد الطبلاوي",
    folder: "Mohammad_al_Tablaway_128kbps",
    note: "Egyptian school · rich voice",
    style: "murattal",
    country: "Egypt",
    wikipedia: "Mohamed_Mahmoud_Tablawi",
  },
  {
    id: "jibreel",
    name: "Muhammad Jibreel",
    arabicName: "محمد جبريل",
    folder: "Muhammad_Jibreel_128kbps",
    note: "Imam of Amr ibn al-As Mosque",
    style: "murattal",
    country: "Egypt",
    wikipedia: "Muhammad_Jibril",
  },
  {
    id: "mustafa_ismail",
    name: "Mustafa Ismail",
    arabicName: "مصطفى إسماعيل",
    folder: "Mustafa_Ismail_48kbps",
    note: "Classic mujawwad master (archive recording)",
    style: "mujawwad",
    country: "Egypt",
    wikipedia: "Mustafa_Ismail",
  },
  {
    id: "banna",
    name: "Mahmoud Ali Al-Banna",
    arabicName: "محمود علي البنا",
    folder: "Mahmoud_Ali_Al_Banna_32kbps",
    note: "Classic Egyptian school (archive recording)",
    style: "murattal",
    country: "Egypt",
    wikipedia: "Mahmoud_Ali_Al_Banna",
  },
  {
    id: "akhdar",
    name: "Ibrahim Al-Akhdar",
    arabicName: "إبراهيم الأخضر",
    folder: "Ibrahim_Akhdar_32kbps",
    note: "Former imam of the Prophet's Mosque (archive recording)",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Ibrahim_Al-Akhdar",
  },
  // ── Levant, Yemen and beyond ─────────────────────────────────────────────
  {
    id: "rifai",
    name: "Hani Ar-Rifai",
    arabicName: "هاني الرفاعي",
    folder: "Hani_Rifai_192kbps",
    note: "Emotive · high quality",
    style: "murattal",
    country: "Saudi Arabia",
    wikipedia: "Hani_Ar-Rifai",
  },
  {
    id: "sowaid",
    name: "Ayman Suwaid",
    arabicName: "أيمن سويد",
    folder: "Ayman_Sowaid_64kbps",
    note: "Tajweed scholar · precise",
    style: "teaching",
    country: "Syria",
    wikipedia: "Ayman_Suwaid",
  },
  {
    id: "abbad",
    name: "Fares Abbad",
    arabicName: "فارس عباد",
    folder: "Fares_Abbad_64kbps",
    note: "Yemeni · beautiful tone",
    style: "murattal",
    country: "Yemen",
    wikipedia: "Fares_Abbad",
  },
  {
    id: "yassin",
    name: "Sahl Yassin",
    arabicName: "سهل ياسين",
    folder: "Sahl_Yassin_128kbps",
    note: "Clear and steady",
    style: "murattal",
    country: "Saudi Arabia",
  },
  {
    id: "salamah",
    name: "Yaser Salamah",
    arabicName: "ياسر سلامة",
    folder: "Yaser_Salamah_128kbps",
    note: "Melodic",
    style: "murattal",
    country: "Egypt",
  },
  {
    id: "suesy",
    name: "Ali Hajjaj Al-Suesy",
    arabicName: "علي حجاج السويسي",
    folder: "Ali_Hajjaj_AlSuesy_128kbps",
    note: "Egyptian school",
    style: "murattal",
    country: "Egypt",
  },
  {
    id: "alaqimy",
    name: "Akram Al-Alaqimy",
    arabicName: "أكرم العلاقمي",
    folder: "Akram_AlAlaqimy_128kbps",
    note: "Yemeni",
    style: "murattal",
    country: "Yemen",
  },
  {
    id: "alili",
    name: "Aziz Alili",
    arabicName: "عزيز عليلي",
    folder: "Aziz_Alili_128kbps",
    note: "Bosnian qari · clear",
    style: "murattal",
    country: "Bosnia and Herzegovina",
  },
  {
    id: "parhizgar",
    name: "Shahriar Parhizgar",
    arabicName: "شهريار پرهيزگار",
    folder: "Parhizgar_48kbps",
    note: "Iranian · measured",
    style: "murattal",
    country: "Iran",
  },
  {
    id: "mansoori",
    name: "Karim Mansoori",
    arabicName: "كريم منصوري",
    folder: "Karim_Mansoori_40kbps",
    note: "Iranian · mujawwad",
    style: "mujawwad",
    country: "Iran",
  },
  {
    id: "rifai_nabil",
    name: "Nabil Ar-Rifai",
    arabicName: "نبيل الرفاعي",
    folder: "Nabil_Rifa3i_48kbps",
    note: "Syrian",
    style: "murattal",
    country: "Syria",
  },
];

export const DEFAULT_RECITER_ID = "alafasy";

export function getReciter(id: string | null | undefined): Reciter {
  return RECITERS.find((r) => r.id === id) ?? RECITERS[0];
}

/** Recording bitrate parsed from the everyayah folder name, in kbps. */
export function reciterBitrate(r: Reciter): number {
  const m = r.folder.match(/(\d+)\s*kbps/i);
  return m ? Number(m[1]) : 0;
}

/** Rough quality label for the picker. */
export function reciterQuality(r: Reciter): "high" | "standard" | "archive" {
  const k = reciterBitrate(r);
  if (k >= 128) return "high";
  if (k >= 64) return "standard";
  return "archive";
}

export const STYLE_LABEL: Record<ReciterStyle, string> = {
  murattal: "Murattal",
  mujawwad: "Mujawwad",
  teaching: "Teaching",
};

/** Countries present in the catalogue, most reciters first. */
export function reciterCountries(): string[] {
  const counts = new Map<string, number>();
  for (const r of RECITERS) counts.set(r.country, (counts.get(r.country) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([c]) => c);
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

/** English Wikipedia article URL for the reciter, if known. */
export function reciterWikipediaUrl(r: Reciter): string | null {
  return r.wikipedia ? `https://en.wikipedia.org/wiki/${r.wikipedia}` : null;
}
