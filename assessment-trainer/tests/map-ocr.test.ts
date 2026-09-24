import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ocrLocal } from "@/lib/vision/ocr";
import { extractStatement } from "@/lib/map/ocr-text";
import { analyzeStatement } from "@/lib/map/classify";
import { POST as analyze } from "@/app/api/analyze/route";

const LABELS = ["Instämmer inte alls", "Instämmer inte", "Neutral", "Instämmer", "Instämmer helt"];

async function mapScreenshot(statement: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="420"><rect width="1000" height="420" fill="#fff"/>
  <rect width="1000" height="40" fill="#dfe1e5"/><text x="40" y="26" font-family="sans-serif" font-size="14" fill="#555">practice.local/personality</text>
  <text x="40" y="80" font-family="sans-serif" font-size="18" fill="#666">Fråga 12 av 80</text>
  <text x="40" y="170" font-family="sans-serif" font-size="30" fill="#111">${statement}</text>
  ${LABELS.map((t, i) => `<rect x="${40 + i * 190}" y="260" width="170" height="50" rx="8" fill="#eef"/><text x="${50 + i * 190}" y="292" font-family="sans-serif" font-size="16">${t}</text>`).join("")}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("MAP OCR (tesseract.js, offline)", () => {
  it("reads the statement from a screenshot", async () => {
    const r = await ocrLocal(await mapScreenshot("Jag planerar alltid mitt arbete noggrant."));
    const { statement } = extractStatement(r.text);
    expect(statement).toBe("Jag planerar alltid mitt arbete noggrant.");
    const a = analyzeStatement(statement);
    expect(a.category).toBe("Conscientiousness");
  });

  it("auto mode: a screenshot without a matrix is treated as a MAP statement", async () => {
    const png = await mapScreenshot("Jag tycker om att lösa komplexa problem.");
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(png)], "map.png", { type: "image/png" }));
    fd.append("mode", "auto");
    const res = await analyze(new Request("http://x", { method: "POST", body: fd }));
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const result = lines.find((l) => l.result).result;
    expect(result.type).toBe("map");
    expect(result.analysis.statement).toMatch(/komplexa problem/);
    expect(result.analysis.category).toBe("Openness");
  });
});
