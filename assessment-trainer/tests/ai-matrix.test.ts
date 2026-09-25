import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AiMatrixReading } from "@/lib/ai/matrix-reading";

const reading = (over: Partial<AiMatrixReading> = {}): AiMatrixReading => ({
  isMatrixQuestion: true,
  layout: { rows: 3, cols: 3, emptyRow: 3, emptyCol: 3, optionLabels: ["1", "2", "3", "4", "5", "6", "7", "8"], notes: "" },
  cells: [{ row: 1, col: 1, description: "vertical lines with two dots" }],
  rules: [{ appliesTo: "columns", part: "background", description: "row 3 = row 1 overlaid on row 2", holds: true }],
  prediction: "crossed curves with a thick plus, no dots",
  options: ["1", "2", "3", "4", "5", "6", "7", "8"].map((label) => ({ label, description: "", matches: label === "7", difference: label === "7" ? "" : "differs" })),
  answer: "7",
  confidence: 0.85,
  explanation: "Background combines by columns, bars by rows.",
  ...over,
});

const jsonCall = vi.fn(async () => reading());
vi.mock("@/lib/ai/anthropic", async (orig) => ({ ...(await orig<object>()), jsonCall: (...a: unknown[]) => jsonCall(...(a as [])) }));

const { judgeReading } = await import("@/lib/ai/matrix-reading");
const { POST: analyze } = await import("@/app/api/analyze/route");

describe("Claude reading of unknown matrix layouts", () => {
  it("shows an answer only when exactly one option fits with enough confidence", () => {
    expect(judgeReading(reading())).toMatchObject({ status: "solved", answer: "7" });
    expect(judgeReading(reading({ confidence: 0.4 })).status).toBe("uncertain");
    expect(judgeReading(reading({ answer: null })).answer).toBeNull();
    const two = reading({ options: reading().options.map((o) => ({ ...o, matches: o.label === "5" || o.label === "7" })) });
    expect(judgeReading(two)).toMatchObject({ status: "uncertain", answer: null });
    expect(judgeReading(reading({ answer: "9" })).status).toBe("uncertain");
    expect(judgeReading(reading({ answer: "5" })).status).toBe("uncertain"); // disagrees with the option check
    expect(judgeReading(reading({ isMatrixQuestion: false })).status).toBe("uncertain");
    expect(judgeReading(reading({ rules: [{ appliesTo: "rows", part: "whole", description: "x", holds: false }] })).status).toBe("uncertain");
  });

  describe("analyze route", () => {
    const env = { ...process.env };
    beforeAll(() => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      delete process.env.AI_MATRIX_FALLBACK;
    });
    afterAll(() => {
      process.env = env;
    });

    async function upload() {
      // A picture with no box grid: the local pipeline cannot read it.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#fff"/><path d="M60 40 L60 140 M80 40 L80 140 M200 40 L300 140" stroke="#000" stroke-width="3"/></svg>`;
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const fd = new FormData();
      fd.append("file", new File([new Uint8Array(png)], "q.png", { type: "image/png" }));
      fd.append("mode", "matrigma");
      const lines = (await (await analyze(new Request("http://x", { method: "POST", body: fd }))).text()).trim().split("\n").map((l) => JSON.parse(l));
      return lines.find((l) => l.result)?.result;
    }

    it("falls back to Claude for a layout the rule solver cannot read", async () => {
      const r = await upload();
      expect(r.type).toBe("ai-matrix");
      expect(r.verdict).toMatchObject({ status: "solved", answer: "7" });
      expect(jsonCall).toHaveBeenCalled();
    }, 60_000);

    it("keeps the normal error when the fallback is switched off", async () => {
      process.env.AI_MATRIX_FALLBACK = "off";
      jsonCall.mockClear();
      const r = await upload();
      expect(r.type).toBe("error");
      expect(jsonCall).not.toHaveBeenCalled();
      delete process.env.AI_MATRIX_FALLBACK;
    }, 60_000);

    it("reports a failed Claude call without inventing an answer", async () => {
      jsonCall.mockRejectedValueOnce(new Error("network down"));
      const r = await upload();
      expect(r.type).toBe("error");
      expect(r.detail).toContain("network down");
    }, 60_000);
  });
});
