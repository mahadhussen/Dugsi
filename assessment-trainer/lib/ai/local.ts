import type { ReasoningProvider, TextProvider, VisionProvider } from "./types";
import { analyzeMatrixLocal } from "../vision/local";
import { ocrLocal } from "../vision/ocr";
import { analyzeStatement } from "../map/classify";

/** Fully offline providers: OpenCV via Python, tesseract.js OCR, keyword classifier. */
export const localVision: VisionProvider = {
  name: "local (OpenCV + tesseract.js)",
  async extractMatrix(image) {
    return analyzeMatrixLocal(image);
  },
  async extractText(image) {
    return ocrLocal(image);
  },
};

export const localText: TextProvider = {
  name: "local (keyword lexicon)",
  async analyzeStatement(statement) {
    return analyzeStatement(statement);
  },
};

export const localReasoning: ReasoningProvider = {
  name: "local (template explanations)",
  async explain() {
    return null; // the solver's own explanation is already complete
  },
};
