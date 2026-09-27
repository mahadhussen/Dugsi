import fs from "node:fs";
import path from "node:path";

const LANGS = ["swe", "eng"];

/** Collect the language files from the @tesseract.js-data npm packages into one folder (offline). */
function tessdataDir(): string {
  const dir = process.env.TESSDATA_DIR ?? path.join(process.cwd(), "data", "tessdata");
  fs.mkdirSync(dir, { recursive: true });
  for (const lang of LANGS) {
    const target = path.join(dir, `${lang}.traineddata.gz`);
    if (fs.existsSync(target)) continue;
    const src = path.join(process.cwd(), "node_modules", "@tesseract.js-data", lang, "4.0.0_best_int", `${lang}.traineddata.gz`);
    if (!fs.existsSync(src)) throw new Error(`OCR language data missing: install @tesseract.js-data/${lang}`);
    fs.copyFileSync(src, target);
  }
  return dir;
}

/** Local OCR with tesseract.js (Swedish + English), fully offline. */
export async function ocrLocal(image: Buffer): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  let workerError: unknown = null;
  const worker = await createWorker(LANGS, 1, {
    langPath: tessdataDir(),
    cacheMethod: "none",
    gzip: true,
    // Report worker failures as errors instead of crashing the server process.
    errorHandler: (e: unknown) => {
      workerError = e;
    },
  });
  try {
    const { data } = await worker.recognize(image);
    if (workerError) throw workerError;
    return { text: data.text ?? "", confidence: (data.confidence ?? 0) / 100 };
  } finally {
    await worker.terminate();
  }
}
