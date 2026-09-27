import { describe, expect, it } from "vitest";
import { generateQuestion } from "@/lib/matrigma/generator";
import { MATRIGMA_CATEGORIES, DIFFICULTIES } from "@/lib/matrigma/types";
import { explainSv, ruleSv } from "@/lib/matrigma/explain-sv";

describe("Swedish explanations", () => {
  it("translate every rule the generator writes", () => {
    const missing = new Set<string>();
    for (const category of MATRIGMA_CATEGORIES)
      for (const difficulty of DIFFICULTIES)
        for (const noise of [false, true])
          for (let s = 1; s <= 12; s++) {
            let q;
            try { q = generateQuestion({ category, difficulty, noise, seed: s * 7919 + difficulty.length }); } catch { continue; }
            for (const r of q.rules) if (!ruleSv(r.description)) missing.add(r.description);
          }
    expect([...missing]).toEqual([]);
  });

  it("gives the answer and a tip", () => {
    const q = generateQuestion({ category: "cutout", difficulty: "expert", seed: 5 });
    const e = explainSv(q, "F");
    expect(e.complete).toBe(true);
    expect(e.answer).toContain("F");
    expect(e.tip.length).toBeGreaterThan(10);
  });
});
