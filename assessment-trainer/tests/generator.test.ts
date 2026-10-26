import { describe, expect, it } from "vitest";
import { generateQuestion } from "@/lib/matrigma/generator";
import { MATRIGMA_CATEGORIES, DIFFICULTIES } from "@/lib/matrigma/types";
import { cellSimilarityStrict } from "@/lib/solver/similarity";
import { renderScreenshotSvg } from "@/lib/matrigma/render";

describe("practice generator", () => {
  it("is deterministic for a seed", () => {
    expect(generateQuestion({ category: "count", seed: 7 })).toEqual(generateQuestion({ category: "count", seed: 7 }));
  });

  for (const category of MATRIGMA_CATEGORIES) {
    it(`${category}: known solution, rule, difficulty, category and distinct options`, () => {
      for (const difficulty of DIFFICULTIES) {
        const q = generateQuestion({ category, difficulty, seed: 99 });
        expect(q.category).toBe(category);
        expect(q.rules.length).toBeGreaterThan(0);
        expect(q.ruleText.length).toBeGreaterThan(10);
        expect(q.problem.options).toHaveLength(6);
        expect(q.correctAnswer).toBeGreaterThanOrEqual(0);
        expect(q.problem.cells.filter((c) => c === null)).toHaveLength(1);
        const opts = q.problem.options;
        for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) expect(cellSimilarityStrict(opts[i], opts[j])).toBeLessThan(0.95);
      }
    });
  }

  it("hard questions combine at least two rules", () => {
    expect(generateQuestion({ category: "multi-rule", difficulty: "hard", seed: 3 }).rules.length).toBeGreaterThanOrEqual(2);
    expect(generateQuestion({ category: "multi-rule", difficulty: "expert", seed: 3 }).rules.length).toBeGreaterThanOrEqual(3);
  });

  it("renders an SVG screenshot", () => {
    const { svg, width, height } = renderScreenshotSvg(generateQuestion({ seed: 1 }).problem);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(width).toBeGreaterThan(300);
    expect(height).toBeGreaterThan(300);
  });
});
