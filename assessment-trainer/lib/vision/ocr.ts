/**
 * Local OCR with tesseract.js (Swedish + English). Runs in-process; the
 * language data is downloaded once from the tesseract.js CDN and cached.
 */
export async function ocrLocal(image: Buffer): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["swe", "eng"], 1, {
    cachePath: process.env.TESSERACT_CACHE ?? "./data/tesseract",
  });
  try {
    const { data } = await worker.recognize(image);
    return { text: data.text ?? "", confidence: (data.confidence ?? 0) / 100 };
  } finally {
    await worker.terminate();
  }
}
