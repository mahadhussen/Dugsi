import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { analyzeWithPython } from "@/lib/vision/python";
import { toProblem } from "@/lib/vision/problem";
import { solveMatrix } from "@/lib/solver/solve";
import { hasPython } from "./helpers";
import { generateQuestion } from "@/lib/matrigma/generator";
import { renderScreenshotSvg } from "@/lib/matrigma/render";

const DIR = path.join(__dirname, "..", "test-data", "screenshots");
const fixtures = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".png")) : [];

describe.skipIf(!hasPython())("vision pipeline (Python/OpenCV)", () => {
  it("has fixtures", () => expect(fixtures.length).toBeGreaterThan(10));

  it("detects the matrix, cells, missing cell and options", async () => {
    for (const f of fixtures.slice(0, 8)) {
      const truth = JSON.parse(fs.readFileSync(path.join(DIR, f.replace(".png", ".json")), "utf8"));
      const v = await analyzeWithPython(fs.readFileSync(path.join(DIR, f)));
      expect(v.ok, `${f}: ${!v.ok ? v.error : ""}`).toBe(true);
      if (!v.ok) continue;
      expect(v.matrix).toEqual({ rows: 3, columns: 3 });
      expect(v.missingCell).toEqual([2, 2]);
      expect(v.answerOptions).toBe(truth.problem.options.length);
      expect(v.debug.cells).toHaveLength(9);
    }
  });

  it("extracts objects matching the ground truth", async () => {
    const f = fixtures.find((x) => x.startsWith("count-"))!;
    const truth = JSON.parse(fs.readFileSync(path.join(DIR, f.replace(".png", ".json")), "utf8"));
    const v = await analyzeWithPython(fs.readFileSync(path.join(DIR, f)));
    if (!v.ok) throw new Error(v.error);
    const { problem } = toProblem(v);
    problem.cells.forEach((c, i) => {
      if (!c) return;
      expect(c.objects.length).toBe(truth.problem.cells[i].objects.length);
      expect(c.objects[0].shape).toBe(truth.problem.cells[i].objects[0].shape);
    });
  });

  it("solves every fixture end-to-end without a wrong answer", async () => {
    let correct = 0;
    for (const f of fixtures) {
      const truth = JSON.parse(fs.readFileSync(path.join(DIR, f.replace(".png", ".json")), "utf8"));
      const v = await analyzeWithPython(fs.readFileSync(path.join(DIR, f)));
      if (!v.ok) continue;
      const s = solveMatrix(toProblem(v).problem, { extractionQuality: v.quality });
      if (s.answer !== null) expect(s.answer, f).toBe(truth.correctAnswer);
      if (s.answer === truth.correctAnswer) correct++;
    }
    expect(correct / fixtures.length).toBeGreaterThanOrEqual(0.9);
  });

  it("refuses non-matrix images and reports the problem", async () => {
    const blank = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const v = await analyzeWithPython(blank);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.stage).toBe("matrix");
  });

  it("reports line-pattern matrices as unsupported instead of misreading them", async () => {
    for (const difficulty of ["easy", "hard"] as const) {
      const q = generateQuestion({ category: "overlay", difficulty, seed: 8080 });
      const png = await sharp(Buffer.from(renderScreenshotSvg(q.problem).svg)).png().toBuffer();
      const v = await analyzeWithPython(png);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.stage).toBe("objects");
    }
  });

  it("returns a decode error for garbage bytes", async () => {
    const v = await analyzeWithPython(Buffer.from("not an image"));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.stage).toBe("decode");
  });
});
