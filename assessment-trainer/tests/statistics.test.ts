import { describe, expect, it } from "vitest";
import { computeStats, median } from "@/lib/statistics/stats";
import { calibrationTable, expectedCalibrationError } from "@/lib/statistics/calibration";
import { categoryWeights, difficultyFor, pickAdaptive } from "@/lib/statistics/adaptive";

const t = (d: string) => new Date(`${d}T10:00:00Z`);
const att = (category: string, isCorrect: boolean, responseTime: number, day = "2026-09-20", confidence: number | null = 0.9) => ({ category, isCorrect, responseTime, difficulty: "easy", confidence, timestamp: t(day) });

describe("statistics", () => {
  const data = [
    ...Array.from({ length: 10 }, (_, i) => att("rotation", i < 9, 10_000)),
    ...Array.from({ length: 10 }, (_, i) => att("reflection", i < 6, 30_000, "2026-09-22")),
    att("count", true, 5_000, "2026-09-23"),
  ];
  const s = computeStats(data, t("2026-09-24"));
  it("accuracy, average and median response time", () => {
    expect(s.total).toBe(21);
    expect(s.accuracy).toBeCloseTo(16 / 21);
    expect(s.medianTimeMs).toBe(10_000);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("accuracy by category and over time", () => {
    expect(s.byCategory.find((g) => g.key === "reflection")!.accuracy).toBeCloseTo(0.6);
    expect(s.overTime.map((d) => d.day)).toEqual(["2026-09-20", "2026-09-22", "2026-09-23"]);
  });
  it("weakest/strongest need at least 3 attempts", () => {
    expect(s.weakest[0].key).toBe("reflection");
    expect(s.strongest[0].key).toBe("rotation");
    expect(s.weakest.some((g) => g.key === "count")).toBe(false);
  });
  it("this week", () => expect(s.thisWeek).toBe(21));
});

describe("confidence calibration", () => {
  it("bins confidence and reports observed accuracy", () => {
    const pts = [...Array(10)].map((_, i) => ({ confidence: 0.95, correct: i < 9 })).concat([...Array(10)].map((_, i) => ({ confidence: 0.75, correct: i < 7 })));
    const bins = calibrationTable(pts);
    expect(bins.find((b) => b.lo === 0.9)!.accuracy).toBeCloseTo(0.9);
    expect(bins.find((b) => b.lo === 0.7)!.accuracy).toBeCloseTo(0.7);
    expect(expectedCalibrationError(pts)).toBeLessThan(0.06);
  });
});

describe("adaptive practice", () => {
  const byCategory = [
    { key: "rotation", attempts: 25, correct: 23, accuracy: 0.92, avgTimeMs: 10_000 },
    { key: "multi-rule", attempts: 25, correct: 11, accuracy: 0.44, avgTimeMs: 40_000 },
  ];
  it("weights weak categories higher", () => {
    const w = categoryWeights(byCategory);
    expect(w["multi-rule"]).toBeGreaterThan(w.rotation);
  });
  it("chooses more questions from weak categories", () => {
    const picks = pickAdaptive(byCategory, 400, 1);
    const n = (c: string) => picks.filter((p) => p.category === c).length;
    expect(n("multi-rule")).toBeGreaterThan(n("rotation") * 2);
  });
  it("raises difficulty with accuracy", () => {
    expect(difficultyFor(undefined)).toBe("easy");
    expect(difficultyFor(byCategory[0])).toBe("expert");
    expect(difficultyFor(byCategory[1])).toBe("easy");
  });
});
