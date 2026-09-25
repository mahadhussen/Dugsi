import { describe, expect, it } from "vitest";
import { abilityReport, estimateAbility, ITEM_TYPES, nextItem, type TestResponse } from "@/lib/statistics/ability-test";
import { generateQuestion } from "@/lib/matrigma/generator";
import { solveMatrix } from "@/lib/solver/solve";

/** Simulate a test taker with true ability `theta` answering by the Rasch model. */
function simulate(theta: number, n: number, seed: number): TestResponse[] {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const out: TestResponse[] = [];
  for (let i = 0; i < n; i++) {
    const it = nextItem(out, rand);
    const p = 1 / (1 + Math.exp(-(theta - it.b)));
    out.push({ ...it, correct: rand() < p, timeMs: 20000 });
  }
  return out;
}

describe("adaptive ability test", () => {
  it("starts in the middle and moves up after correct answers, down after wrong ones", () => {
    const first = nextItem([], () => 0);
    expect(Math.abs(first.b)).toBeLessThan(0.8);
    const up = estimateAbility([{ ...first, correct: true, timeMs: 1 }]).theta;
    const down = estimateAbility([{ ...first, correct: false, timeMs: 1 }]).theta;
    expect(up).toBeGreaterThan(0);
    expect(down).toBeLessThan(0);
    expect(nextItem([{ ...first, correct: true, timeMs: 1 }], () => 0).b).toBeGreaterThan(first.b);
  });

  it("recovers a simulated ability within about half a logit after 20 questions", () => {
    for (const truth of [-1.5, 0, 1.2]) {
      // 40 simulated test takers: a few would be noisy; EAP pulls slightly towards the middle.
      const errs = Array.from({ length: 40 }, (_, k) => estimateAbility(simulate(truth, 20, (k + 1) * 977)).theta - truth);
      const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
      expect(Math.abs(mean)).toBeLessThan(0.4);
    }
  });

  it("never asks the same category twice in a row and reports a 1-9 level", () => {
    const r = simulate(0.5, 20, 42);
    for (let i = 1; i < r.length; i++) expect(r[i].category).not.toBe(r[i - 1].category);
    const rep = abilityReport(r);
    expect(rep.stanine).toBeGreaterThanOrEqual(1);
    expect(rep.stanine).toBeLessThanOrEqual(9);
    expect(rep.total).toBe(20);
  });

  it("every item type can be generated and is solved by the verifier", () => {
    for (const it of ITEM_TYPES) {
      const q = generateQuestion({ category: it.category, difficulty: it.difficulty, seed: 321 });
      expect(q.category).toBe(it.category);
      expect(solveMatrix(q.problem).answer).toBe(q.correctAnswer);
    }
  });
});

describe("rolling block questions", () => {
  it("are solved correctly, with the rolling rule in the explanation", () => {
    for (const d of ["easy", "medium", "hard", "expert"] as const) {
      for (let i = 0; i < 20; i++) {
        const q = generateQuestion({ category: "rolling", difficulty: d, seed: 7000 + i * 13 });
        const s = solveMatrix(q.problem);
        expect(s.answer).toBe(q.correctAnswer);
        expect(s.explanation.rules.join(" ")).toMatch(/rolls .* (counter-)?clockwise/);
      }
    }
  });

  it("finds the rolling square's positions in clockwise order", async () => {
    const { rollPositions } = await import("@/lib/solver/rolling");
    // Horizontal domino: above-left, above-right, right, below-right, below-left, left.
    expect(rollPositions([[0, 0], [1, 0]])).toEqual([[0, -1], [1, -1], [2, 0], [1, 1], [0, 1], [-1, 0]]);
  });
});

describe("growing petal questions", () => {
  it("are solved correctly and explain where the petals grow", () => {
    for (const d of ["easy", "medium", "hard", "expert"] as const) {
      for (let i = 0; i < 20; i++) {
        const q = generateQuestion({ category: "petals", difficulty: d, seed: 9100 + i * 11 });
        const s = solveMatrix(q.problem);
        expect(s.answer).toBe(q.correctAnswer);
        expect(s.explanation.rules.join(" ")).toMatch(/petal/);
      }
    }
  });

  it("a flower turned by one step (right count, wrong position) is not accepted", () => {
    const q = generateQuestion({ category: "petals", difficulty: "medium", seed: 42 });
    const s = solveMatrix(q.problem);
    const correct = q.problem.options[q.correctAnswer].petals!.length;
    const sameCount = q.problem.options.filter((o, i) => i !== q.correctAnswer && o.petals!.length === correct);
    expect(sameCount.length).toBeGreaterThan(0);
    expect(s.answer).toBe(q.correctAnswer);
  });
});

describe("new question types (glyphs, lines and dots, overlay anywhere)", () => {
  const cats = ["linesdots", "hatch", "swap", "dotpath", "orbit", "emblem", "strip", "lined", "bands"] as const;
  it.each(cats)("%s: generated at every level and solved with the intended answer", (category) => {
    for (const d of ["easy", "medium", "hard", "expert"] as const) {
      for (let i = 0; i < 12; i++) {
        const q = generateQuestion({ category, difficulty: d, seed: 4400 + i * 29 });
        const s = solveMatrix(q.problem);
        expect(s.answer).toBe(q.correctAnswer);
        expect(s.explanation.rules.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("line pattern (overlay) questions", () => {
  it("are solved correctly with an explanation that names the layers", () => {
    for (const d of ["easy", "medium", "hard", "expert"] as const) {
      for (let i = 0; i < 25; i++) {
        const q = generateQuestion({ category: "overlay", difficulty: d, seed: 5000 + i * 17 });
        const s = solveMatrix(q.problem);
        expect(s.answer).toBe(q.correctAnswer);
        expect(s.explanation.rules.join(" ")).toMatch(/background lines/);
      }
    }
  });
});
