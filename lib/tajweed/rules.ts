import type { RuleId } from "@/lib/quran/fatiha";

export interface RuleMeta {
  id: RuleId;
  label: string;
  /** Tailwind text colour class used to colour the Arabic letters. */
  color: string;
  /** Hex used for the legend swatch. */
  swatch: string;
  description: string;
}

// Colours loosely follow the conventions of colour-coded tajweed Mushafs.
export const RULES: Record<RuleId, RuleMeta> = {
  madd_natural: {
    id: "madd_natural",
    label: "Madd (natural)",
    color: "text-rose-600",
    swatch: "#e11d48",
    description: "A long vowel held for about 2 counts (alif, wāw, yāʾ).",
  },
  madd_lazim: {
    id: "madd_lazim",
    label: "Madd Lāzim",
    color: "text-red-700 font-bold",
    swatch: "#b91c1c",
    description: "Obligatory long madd held for ~6 counts — as in 'aḍ-ḍāāāllīn'.",
  },
  ghunnah: {
    id: "ghunnah",
    label: "Ghunnah",
    color: "text-emerald-600",
    swatch: "#059669",
    description: "Nasal sound (~2 counts) on a doubled noon or meem.",
  },
  sun_letter: {
    id: "sun_letter",
    label: "Sun letter (lām shamsiyya)",
    color: "text-amber-600",
    swatch: "#d97706",
    description: "The 'al-' lām is silent; the following letter is doubled (e.g. ar-Raḥmān).",
  },
  moon_letter: {
    id: "moon_letter",
    label: "Moon letter (lām qamariyya)",
    color: "text-sky-600",
    swatch: "#0284c7",
    description: "The 'al-' lām is clearly pronounced (e.g. al-Ḥamd).",
  },
  leen: {
    id: "leen",
    label: "Leen (soft letter)",
    color: "text-violet-600",
    swatch: "#7c3aed",
    description: "A soft wāw/yāʾ with sukūn after a fatḥa (e.g. yawm, ʿalayhim).",
  },
  lam_jalalah: {
    id: "lam_jalalah",
    label: "Lām of Allah",
    color: "text-teal-600",
    swatch: "#0d9488",
    description: "The lām in the name 'Allah' — light (tarqeeq) after a kasra here.",
  },
  tafkheem: {
    id: "tafkheem",
    label: "Tafkhīm (heavy)",
    color: "text-orange-700",
    swatch: "#c2410c",
    description: "Emphatic letters (ṣ, ḍ, ṭ, ...) recited full and heavy.",
  },
  shaddah: {
    id: "shaddah",
    label: "Shaddah",
    color: "text-fuchsia-600",
    swatch: "#c026d3",
    description: "A doubled consonant — pronounced with stress.",
  },
  izhar: {
    id: "izhar",
    label: "Iẓhār",
    color: "text-cyan-600",
    swatch: "#0891b2",
    description: "Noon sākin pronounced clearly before a throat letter (e.g. anʿamta).",
  },
};

/** Colour for the highest-priority rule on a word (used for the main glyph colour). */
export function primaryRuleColor(rules: RuleId[]): string | null {
  const priority: RuleId[] = [
    "madd_lazim",
    "madd_natural",
    "ghunnah",
    "sun_letter",
    "moon_letter",
    "leen",
    "lam_jalalah",
    "tafkheem",
    "izhar",
    "shaddah",
  ];
  for (const id of priority) {
    if (rules.includes(id)) return RULES[id].color;
  }
  return null;
}
