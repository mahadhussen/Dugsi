import { fatiha, flattenWords, type RuleId } from "@/lib/quran/fatiha";
import { RULES } from "@/lib/tajweed/rules";

/** Tajweed legend — only shows the rules that actually occur in Al-Fatiha. */
export default function Legend() {
  const used = new Set<RuleId>();
  for (const { word } of flattenWords(fatiha)) {
    word.rules.forEach((r) => used.add(r));
  }
  const items = Array.from(used).map((id) => RULES[id]);

  return (
    <div className="rounded-xl border border-gold/30 bg-white/60 p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink/70">
        Tajweed guide
      </h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((r) => (
          <li key={r.id} className="flex items-start gap-2 text-sm">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: r.swatch }}
              aria-hidden
            />
            <span>
              <span className="font-medium">{r.label}</span>
              <span className="text-ink/60"> — {r.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
