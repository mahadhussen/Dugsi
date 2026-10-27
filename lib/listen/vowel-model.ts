// The vowel model: which files, and the letters it writes.
//
// rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final (Apache-2.0), a CTC
// model fine-tuned on Quran recitation that writes Arabic with every vowel
// mark, through a community 4-bit ONNX export for transformers.js, pinned to
// one commit. It has no language model, so it does not pull what it hears
// toward the text the way the listening model (Whisper) does.
//
// Measured before choosing it (2026-10-27, WORKLOG round 6): it caught 45 of
// 49 deliberate vowel mistakes, the listening model 27; no false alarm on
// 2 790 right vowels from four masters, echo, noise and a classroom.

export const VOWEL_MODEL = {
  id: "mostafanewir70/quran-recitation-ctc-onnx",
  revision: "f90650aac5d9dcff15230a19998c0027f45b33f1",
  base: "rabah2026/wav2vec2-large-xlsr-53-arabic-quran-v_final",
  dtype: "q4",
  sha256: {
    "onnx/model_q4.onnx": "9b17e04fdc2aef54720e62216a7c7ae7f55d27911ee7cd55253baa231845a587",
  },
  /** Download size, the first time. */
  approxMb: 241,
  /** The model's letters (its vocab.json): letter → token id. */
  vocab: {
    "<pad>": 0, "<s>": 1, "</s>": 2, "<unk>": 3, "|": 4, "-": 5,
    "ء": 6, "آ": 7, "أ": 8, "ؤ": 9, "إ": 10, "ئ": 11, "ا": 12, "ب": 13, "ة": 14, "ت": 15,
    "ث": 16, "ج": 17, "ح": 18, "خ": 19, "د": 20, "ذ": 21, "ر": 22, "ز": 23, "س": 24, "ش": 25,
    "ص": 26, "ض": 27, "ط": 28, "ظ": 29, "ع": 30, "غ": 31, "ـ": 32, "ف": 33, "ق": 34, "ك": 35,
    "ل": 36, "م": 37, "ن": 38, "ه": 39, "و": 40, "ى": 41, "ي": 42,
    "ً": 43, "ٌ": 44, "ٍ": 45, "َ": 46, "ُ": 47, "ِ": 48, "ّ": 49, "ْ": 50,
    "ٱ": 51, "ٰ": 52, "ٓ": 53, "ۥ": 54, "ۦ": 55,
  } as Record<string, number>,
  blank: 0,
  delimiter: 4,
} as const;
