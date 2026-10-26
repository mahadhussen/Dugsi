import { describe, expect, it } from "vitest";
import { runBenchmark } from "@/scripts/benchmark";

/** At least 100 synthetic questions with known answers per required category. */
const REQUIRED = ["rotation", "reflection", "count", "position", "fill", "composition", "alternation", "multi-rule"] as const;

describe("solver benchmark (100 per category)", () => {
  const { rows } = runBenchmark(100, REQUIRED, 424242);
  for (const r of rows) {
    it(`${r.category}: accuracy ≥ 95%, wrong ≤ 2%`, () => {
      expect(r.n).toBe(100);
      expect(r.accuracy).toBeGreaterThanOrEqual(0.95);
      expect(r.wrong / r.n).toBeLessThanOrEqual(0.02);
    });
  }
  it("prints accuracy per category", () => {
    console.table(rows.map((r) => ({ category: r.category, accuracy: `${(r.accuracy * 100).toFixed(1)}%`, wrong: r.wrong, abstained: r.abstained })));
  });
});
