import { describe, expect, it } from "vitest";
import { solveMatrix } from "@/lib/solver/solve";
import { cellSimilarity, cellSimilarityStrict } from "@/lib/solver/similarity";
import { computeConfidence, calibrate } from "@/lib/solver/confidence";
import { TRANSFORMS } from "@/lib/solver/transforms";
import { cell, obj, problem } from "./helpers";

describe("rotation detection", () => {
  it("finds a 90° clockwise rotation per step and picks the right option", () => {
    const p = problem(
      (r, c) => cell(obj("arrow", { rotation: (r * 90 + c * 90) % 360 })),
      [0, 90, 180, 270, 45, 135].map((rot) => cell(obj("arrow", { rotation: rot }))),
    );
    // Row 3 starts at 180, +90 per step → 0 (360)
    const s = solveMatrix(p);
    expect(s.answer).toBe(0);
    expect(s.status).toBe("solved");
    expect(s.explanation.rules.join(" ")).toMatch(/rotat/i);
    expect(s.explanation.validation).toContain("Row 1 ✓");
  });

  it("treats triangle rotations modulo 120°", () => {
    const p = problem(
      (_r, c) => cell(obj("triangle", { rotation: c * 90 })),
      [cell(obj("triangle", { rotation: 60 })), cell(obj("triangle", { rotation: 0 })), cell(obj("triangle", { rotation: 90 })), cell(obj("square")), cell(obj("circle")), cell(obj("arrow"))],
    );
    // 180° ≡ 60° for an equilateral triangle
    expect(solveMatrix(p).answer).toBe(0);
  });
});

describe("reflection detection", () => {
  it("detects a left-right mirror between neighbouring cells", () => {
    const flipH = TRANSFORMS.find((t) => t.id === "flip_h")!;
    const base = (r: number) => cell(obj("arrow", { rotation: 45 + r * 90, x: 0.2, y: 0.2 + r * 0.3, size: 0.35 }), obj("circle", { x: 0.8, y: 0.8, size: 0.2 }));
    const at = (r: number, c: number) => (c === 1 ? flipH.apply(base(r)) : base(r));
    const correct = at(2, 2);
    const options = [flipH.apply(correct), correct, TRANSFORMS.find((t) => t.id === "rotate_90")!.apply(correct), cell(obj("circle")), cell(obj("square")), cell(obj("arrow"))];
    const s = solveMatrix(problem(at, options));
    expect(s.answer).toBe(1);
    expect(s.strategies.find((x) => x.id === "reflection")?.informative).toBe(true);
  });
});

describe("count detection", () => {
  it("detects count progression", () => {
    const slots = [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2]];
    const mk = (n: number) => cell(...slots.slice(0, n).map(([x, y]) => obj("circle", { x, y, size: 0.25 })));
    const p = problem((r, c) => mk(1 + c + (r === 1 ? 0 : 0)), [mk(2), mk(4), mk(3), mk(1), cell(obj("square")), mk(3).objects.length ? cell(...mk(3).objects.map((o) => ({ ...o, fill: 0 as const }))) : mk(3)]);
    const s = solveMatrix(p);
    expect(s.answer).toBe(2);
    expect(s.rules.some((r) => r.attribute === "count" || r.attribute === "cell" || r.attribute === "objects")).toBe(true);
  });
});

describe("answer matching", () => {
  it("identical cells have similarity 1 and different shapes lower", () => {
    const a = cell(obj("square"));
    expect(cellSimilarity(a, a)).toBe(1);
    expect(cellSimilarity(a, cell(obj("circle")))).toBeLessThan(0.8);
    expect(cellSimilarityStrict(a, cell(obj("square"), obj("circle")))).toBe(0);
  });

  it("returns the answer, confidence, strategy and validated flag", () => {
    const p = problem((_r, c) => cell(obj("square", { fill: ([0, 0.5, 1] as const)[c] })), [cell(obj("square", { fill: 0 })), cell(obj("square", { fill: 1 })), cell(obj("circle", { fill: 1 })), cell(obj("square", { fill: 0.5 })), cell(obj("triangle")), cell(obj("star"))]);
    const s = solveMatrix(p);
    expect(s).toMatchObject({ answer: 1, answerLabel: "B", validated: true });
    expect(s.confidence).toBeGreaterThan(0.8);
    expect(typeof s.strategy).toBe("string");
  });
});

describe("confidence", () => {
  it("is not random: same input, same confidence", () => {
    const p = problem((_r, c) => cell(obj("square", { size: [0.45, 0.65, 0.85][c] })), [0.45, 0.65, 0.85, 0.3, 0.55, 0.75].map((s) => cell(obj("square", { size: s }))));
    expect(solveMatrix(p).confidence).toBe(solveMatrix(p).confidence);
  });

  it("drops with poor extraction quality", () => {
    const p = problem((_r, c) => cell(obj("square", { size: [0.45, 0.65, 0.85][c] })), [0.45, 0.65, 0.85, 0.3, 0.55, 0.75].map((s) => cell(obj("square", { size: s }))));
    const good = solveMatrix(p);
    const bad = solveMatrix(p, { extractionQuality: 0.4 });
    expect(bad.answer).toBe(good.answer);
    expect(bad.confidence).toBeLessThan(good.confidence);
    expect(bad.status).toBe("uncertain");
  });

  it("refuses to guess when two options are indistinguishable", () => {
    const same = cell(obj("square"));
    const p = problem(() => cell(obj("square")), [same, cell(obj("square")), cell(obj("circle")), cell(obj("triangle")), cell(obj("star")), cell(obj("hexagon"))]);
    const s = solveMatrix(p);
    expect(s.answer).toBeNull();
    expect(s.candidates).toEqual(expect.arrayContaining([0, 1]));
    expect(s.explanation.notes.join(" ")).toMatch(/Uncertain – inspect manually/);
  });

  it("returns unsolved (no answer) for random noise", () => {
    const shapes = ["circle", "square", "triangle", "star", "hexagon", "cross", "pentagon", "diamond"] as const;
    const p = problem((r, c) => cell(obj(shapes[(r * 5 + c * 3) % 8], { fill: ((r + c) % 2) as 0 | 1, size: 0.3 + ((r * 7 + c * 3) % 5) * 0.12 })), shapes.slice(0, 6).map((s) => cell(obj(s))));
    const s = solveMatrix(p);
    expect(s.status).not.toBe("solved");
  });

  it("agreement and margin raise confidence", () => {
    const base = { consistency: 1, validation: 1, similarity: 1, extraction: 1, tie: false };
    expect(computeConfidence({ ...base, margin: 1, agreement: 1 })).toBeGreaterThan(computeConfidence({ ...base, margin: 0.2, agreement: 0.3 }));
  });

  it("calibration blends with observed accuracy only when there is enough data", () => {
    expect(calibrate(0.95, [{ lo: 0.9, hi: 1, n: 5, accuracy: 0.5 }])).toBe(0.95);
    expect(calibrate(0.95, [{ lo: 0.9, hi: 1, n: 200, accuracy: 0.5 }])).toBeLessThan(0.95);
  });
});
