import type { RuleId } from "@/lib/quran/types";
import { RULES } from "@/lib/tajweed/rules";

// Rules the auto-tagger colours across the whole Quran, in a sensible reading
// order for the guide. (madd_natural / tafkhīm are only hand-tagged in
// Al-Fatiha, so they're listed last.)
const ORDER: RuleId[] = [
  "sun_letter",
  "moon_letter",
  "lam_jalalah",
  "ghunnah",
  "qalqalah",
  "leen",
  "shaddah",
  "madd_lazim",
  "madd_natural",
  "tafkheem",
  "izhar",
];

/** Tajweed legend — the colour key for the whole app. */
export default function Legend() {
  const items = ORDER.map((id) => RULES[id]);

  return (
    <div className="rounded-2xl border border-gold/25 bg-white/70 p-5 shadow-soft backdrop-blur-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-5 w-1.5 rounded-full bg-gold" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/70">Tajweed guide</h3>
      </div>
      <ul className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
        {items.map((r) => (
          <li key={r.id} className="flex items-start gap-2.5 text-sm">
            <span
              className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white"
              style={{ backgroundColor: r.swatch }}
              aria-hidden
            />
            <span>
              <span className="font-semibold" style={{ color: r.swatch }}>
                {r.label}
              </span>
              <span className="text-ink/60"> — {r.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
