/**
 * Confidence is derived from measurable evidence only:
 *  - rule consistency (does the chosen option satisfy the validated rules?)
 *  - number of independently validated lines
 *  - answer-option similarity and margin to the runner-up
 *  - agreement between independent strategies
 *  - visual extraction quality (1.0 for structured / generated input)
 */
export interface ConfidenceInputs {
  consistency: number;
  validation: number;
  similarity: number;
  margin: number;
  agreement: number;
  extraction: number;
  tie: boolean;
}

export function computeConfidence(f: ConfidenceInputs): number {
  const base = 0.2 * f.similarity + 0.25 * f.margin + 0.2 * f.agreement + 0.15 * f.validation + 0.2 * f.consistency;
  let c = f.extraction * base;
  if (f.tie) c = Math.min(c, 0.45);
  return Math.max(0, Math.min(1, c));
}

export const UNCERTAIN_THRESHOLD = 0.6;

/** Calibration bins produced by lib/statistics/calibration. */
export interface CalibrationBin {
  lo: number;
  hi: number;
  n: number;
  accuracy: number;
}

/**
 * Blend raw confidence with the empirically observed accuracy of its bin.
 * Only bins with enough samples are trusted; the blend weight grows with n.
 */
export function calibrate(raw: number, bins: CalibrationBin[] | undefined): number {
  if (!bins?.length) return raw;
  const bin = bins.find((b) => raw >= b.lo && (raw < b.hi || (b.hi >= 1 && raw <= 1)));
  if (!bin || bin.n < 20) return raw;
  const w = Math.min(0.6, bin.n / 200);
  // Never raise confidence above the raw value by more than the observed accuracy supports.
  return Math.max(0, Math.min(1, (1 - w) * raw + w * bin.accuracy));
}
