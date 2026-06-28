// Algorithmic tajweed tagger.
//
// Every surah except Al-Fatiha is shipped as plain (fully-diacritised) Uthmani
// text. To colour the whole Quran we detect tajweed rules directly from those
// diacritics instead of hand-tagging 6000+ ayat. We only emit rules we can
// detect with high confidence and that are visually *distinctive* — the goal is
// a colour-coded mushaf, not a guess. Ubiquitous rules that would paint almost
// every word (generic 2-count madd, tafkhīm of emphatic letters) are left to the
// hand-tagged Al-Fatiha so the colouring stays meaningful rather than noisy.
//
// Detected here:
//   • sun / moon letter   — the "al-" article (lām shamsiyya / qamariyya)
//   • lām al-jalālah       — the name "Allah"
//   • ghunnah              — noon/meem carrying a shadda (نّ / مّ)
//   • qalqalah             — ق ط ب ج د carrying a sukūn
//   • leen                 — وْ / يْ with sukūn after a fatḥa (yawm, ʿalayhim)
//   • madd lāzim           — a maddah (آ / ٓ) followed by a shadda (aḍ-ḍāāāllīn)
//   • shaddah              — any remaining doubled consonant (fallback colour)

import type { RuleId } from "@/lib/quran/types";

// Diacritic codepoints as they actually appear in this corpus.
const SHADDA = 0x0651;
const FATHA = 0x064e;
const MADDAH = 0x0653; // ARABIC MADDAH ABOVE
// Two sukūn glyphs occur in this Uthmani text: the plain sukūn and the small
// high dotless head of khah (used as a sukūn in King-Fahd style mushafs).
const SUKUN_PLAIN = 0x0652;
const SUKUN_KHAH = 0x06e1;

const TATWEEL = 0x0640;

// Letters that assimilate the "al-" lām (lām shamsiyya / "sun letters").
const SUN_LETTERS = new Set([..."تثدذرزسشصضطظلن"]);
// Letters that bounce (qalqalah) when silent.
const QALQALAH_LETTERS = new Set([..."قطبجد"]);

function isMark(code: number): boolean {
  return (
    (code >= 0x064b && code <= 0x065f) || // harakat, tanwin, shadda, sukun, maddah…
    (code >= 0x0610 && code <= 0x061a) || // honorific signs
    (code >= 0x06d6 && code <= 0x06ed) || // small high/low quranic annotation marks
    code === 0x0670 // superscript (dagger) alef
  );
}

interface Unit {
  ch: string;
  marks: Set<number>;
}

/** Split a word into base letters, each with the set of marks attached to it. */
function parseUnits(word: string): Unit[] {
  const units: Unit[] = [];
  for (const ch of word) {
    const c = ch.codePointAt(0)!;
    if (c === TATWEEL) continue;
    if (isMark(c)) {
      if (units.length) units[units.length - 1].marks.add(c);
      continue;
    }
    units.push({ ch, marks: new Set() });
  }
  return units;
}

const hasSukun = (u: Unit) => u.marks.has(SUKUN_PLAIN) || u.marks.has(SUKUN_KHAH);
const hasShadda = (u: Unit) => u.marks.has(SHADDA);
const hasFatha = (u: Unit) => u.marks.has(FATHA);
const hasMaddah = (u: Unit) => u.marks.has(MADDAH);

/** Letters only (marks/tatweel stripped, alef variants unified) — to spot "Allah". */
function lettersOnly(word: string): string {
  let s = "";
  for (const ch of word) {
    const c = ch.codePointAt(0)!;
    if (c === TATWEEL || isMark(c)) continue;
    s += ch;
  }
  return s.replace(/[ٱأإآ]/g, "ا");
}

/**
 * Detect the prominent, high-confidence tajweed rules for a single Uthmani word.
 * Order in the returned array is not significant; the UI picks one colour by
 * priority (see primaryRuleColor).
 */
export function wordRules(input: string): RuleId[] {
  const rules = new Set<RuleId>();
  // Normalise a precomposed آ (U+0622) to alef + combining maddah so detection
  // works regardless of how the maddah is encoded. (This corpus uses the
  // decomposed form, but display strings elsewhere may not.)
  const uthmani = input.replace(/\u0622/g, "\u0627\u0653");
  const units = parseUnits(uthmani);

  // Lām al-jalālah — the divine name "Allah" (also as ...للّٰه / والله / لله).
  const isAllah = lettersOnly(uthmani).includes("لله");
  if (isAllah) rules.add("lam_jalalah");

  // The "al-" definite article: alef(-wasla) + lām near the start. A wasla (ٱ)
  // marks the elidable hamza and is a strong signal; a bare alef only counts at
  // the very start of the word. Skipped for the name Allah.
  if (!isAllah) {
    for (let j = 0; j < units.length - 1; j++) {
      const b = units[j].ch;
      const isArticleAlef = b === "ٱ" || (b === "ا" && j === 0);
      if (isArticleAlef && units[j + 1].ch === "ل") {
        const after = units[j + 2];
        if (after) {
          if (SUN_LETTERS.has(after.ch)) rules.add("sun_letter");
          else rules.add("moon_letter");
        }
        break;
      }
    }
  }

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    // Ghunnah — doubled noon/meem.
    if ((u.ch === "ن" || u.ch === "م") && hasShadda(u)) rules.add("ghunnah");
    // Qalqalah — ق ط ب ج د with an explicit sukūn.
    if (QALQALAH_LETTERS.has(u.ch) && hasSukun(u)) rules.add("qalqalah");
    // Leen — soft wāw/yāʾ: sukūn after a fatḥa.
    if ((u.ch === "و" || u.ch === "ي") && hasSukun(u) && i > 0 && hasFatha(units[i - 1])) {
      rules.add("leen");
    }
    // Any remaining doubled consonant (fallback colour for emphasis).
    if (hasShadda(u)) rules.add("shaddah");
  }

  // Madd lāzim — a maddah (long ~6-count vowel) followed by a shadda in the same
  // word, e.g. aḍ-ḍāāāllīn. (A shadda *before* the maddah is ordinary madd, so
  // we only look forward.)
  const maddIdx = units.findIndex((u) => hasMaddah(u));
  if (maddIdx >= 0) {
    for (let k = maddIdx + 1; k < units.length; k++) {
      if (hasShadda(units[k])) {
        rules.add("madd_lazim");
        break;
      }
    }
  }

  return Array.from(rules);
}

/** Elongation class for the madd-timing engine, derived from the detected rules. */
export function wordMadd(rules: RuleId[]): "natural" | "lazim" | undefined {
  return rules.includes("madd_lazim") ? "lazim" : undefined;
}
