// The one Quran speech model Dugsi listens with, and exactly which files.
//
// Tarteel's whisper-tiny-ar-quran (Apache-2.0, 7 % word error rate on
// recitation) through a community ONNX export, pinned to one commit so the
// weights can never change under us. The published SHA-256 of the two graphs
// we load is recorded here and in THIRD_PARTY.md.
//
// Measured before choosing it (2026-10-25, see WORKLOG.md): the general
// whisper-tiny the app used to fall back to heard "المستطيع" for "المستقيم";
// this model heard Husary's Al-Ikhlas word for word, and Alafasy's Al-Fatiha
// through a phone filter, noise and a 12 % faster pace. The quantised encoder
// cannot load (no ConvInteger kernel), so the encoder runs in fp32.

export const ASR_MODEL = {
  id: "Sharjeelbaig/whisper-tiny-ar-quran-onnx",
  revision: "cd93bdec117adc2f84d6c4ab91c10164a2e9bee9",
  base: "tarteel-ai/whisper-tiny-ar-quran",
  encoderDtype: "fp32",
  decoderDtype: "q8",
  sha256: {
    "onnx/encoder_model.onnx": "f0c604c7ea767c1eab1d26df50dbc3afa861cc28a1a68bd965e6b9e897c5b5c8",
    "onnx/decoder_model_merged_quantized.onnx": "06a5c4409988b9ae7747bd55cf81e3851e3f2238536c86467963e0241464f652",
  },
  /** Download size of what is fetched the first time (both graphs + tokenizer). */
  approxMb: 67,
  transformersCdn: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3",
} as const;
