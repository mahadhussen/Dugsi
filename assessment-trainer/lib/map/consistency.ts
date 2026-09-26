import { SUBSCALES } from "./model";

export interface AnsweredStatement {
  id: string;
  text: string;
  subscale: string;
  keyed: 1 | -1;
  value: number; // 1..7
}

export interface RelatedPair {
  a: AnsweredStatement;
  b: AnsweredStatement;
  relation: "same_direction" | "opposite_direction";
  /** Positions on the trait (1..7) after reverse-keying; large gaps are shown. */
  gap: number;
  message: string;
}

/** Trait position of an answer after taking keying into account. */
export function traitPosition(a: AnsweredStatement): number {
  return a.keyed === 1 ? a.value : 8 - a.value;
}

/**
 * Find pairs of related statements (same facet) whose answers point in
 * different directions. This is shown to help reflection ("These statements
 * appear related") — it never suggests which answer is better.
 */
export function relatedPairs(answers: AnsweredStatement[], minGap = 3): RelatedPair[] {
  const out: RelatedPair[] = [];
  for (let i = 0; i < answers.length; i++) {
    for (let j = i + 1; j < answers.length; j++) {
      const a = answers[i];
      const b = answers[j];
      if (a.subscale !== b.subscale || a.id === b.id) continue;
      const gap = Math.abs(traitPosition(a) - traitPosition(b));
      if (gap < minGap) continue;
      const sub = SUBSCALES.find((s) => s.key === a.subscale);
      const relation = a.keyed === b.keyed ? "same_direction" : "opposite_direction";
      const diff =
        relation === "same_direction"
          ? "Both statements describe the same end of the trait, so they are phrased in the same direction."
          : "The statements describe opposite ends of the trait: agreeing with one usually goes with disagreeing with the other.";
      out.push({
        a,
        b,
        relation,
        gap,
        message: `These statements appear related (${sub?.name ?? a.subscale}). ${diff} Your answers point in different directions — that can be completely fair if the situations differ; consider what each statement specifically describes.`,
      });
    }
  }
  return out.sort((x, y) => y.gap - x.gap);
}

/** Consistency per subscale: 1 = answers agree, 0 = maximally different. */
export function consistencyIndex(answers: AnsweredStatement[]): { subscale: string; n: number; consistency: number }[] {
  const by = new Map<string, number[]>();
  for (const a of answers) {
    const list = by.get(a.subscale) ?? [];
    list.push(traitPosition(a));
    by.set(a.subscale, list);
  }
  return [...by.entries()]
    .filter(([, v]) => v.length >= 2)
    .map(([subscale, v]) => {
      const spread = Math.max(...v) - Math.min(...v);
      return { subscale, n: v.length, consistency: 1 - spread / 6 };
    });
}
