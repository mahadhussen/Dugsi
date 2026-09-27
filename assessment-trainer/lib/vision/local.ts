import sharp from "sharp";
import type { VisionResult } from "./types";
import { analyzeWithPython } from "./python";
import { analyzeRgba } from "./js/pipeline";

/** Matrix extraction with OpenCV when Python is available, otherwise the pure TypeScript pipeline (same JSON contract). */
export async function analyzeMatrixLocal(image: Buffer): Promise<VisionResult> {
  try {
    return { ...(await analyzeWithPython(image)), provider: "local" };
  } catch (pyErr) {
    try {
      const { data, info } = await sharp(image).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      return { ...analyzeRgba({ width: info.width, height: info.height, data }), provider: "browser (Python unavailable)" };
    } catch {
      throw pyErr;
    }
  }
}
