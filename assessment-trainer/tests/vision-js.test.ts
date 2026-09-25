import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeRgba } from "@/lib/vision/js/pipeline";
import { decode, endToEnd, fixtureAccuracy } from "../scripts/js-vision-benchmark";

const DIR = path.join(__dirname, "..", "test-data", "screenshots");

describe("browser vision (pure TypeScript)", () => {
  it("reads the fixture screenshots object by object", async () => {
    const s = await fixtureAccuracy();
    expect(s.ok).toBe(s.files);
    expect(s.shape / s.objects).toBeGreaterThan(0.97);
    expect(s.fill / s.objects).toBeGreaterThan(0.97);
    expect(s.count / s.cells).toBeGreaterThan(0.97);
  }, 60_000);

  it("never gives a wrong answer on rendered screenshots (PNG, JPEG, scaled)", async () => {
    const r = await endToEnd(1, 77000);
    expect(r.wrong).toBe(0);
    expect(r.correct / r.n).toBeGreaterThan(0.85);
  }, 120_000);

  it("reports a detection failure instead of guessing on an image without a matrix", async () => {
    const png = fs.readdirSync(DIR).find((f) => f.endsWith(".png"))!;
    const img = await decode(fs.readFileSync(path.join(DIR, png)));
    const blank = { ...img, data: new Uint8Array(img.data.length).fill(255) };
    const v = analyzeRgba(blank);
    expect(v.ok).toBe(false);
  });
});
