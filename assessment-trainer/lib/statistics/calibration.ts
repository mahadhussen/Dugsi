import type { CalibrationBin } from "../solver/confidence";

export const CALIBRATION_EDGES = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];

/** Group (confidence, correct) points into confidence bins with observed accuracy. */
export function calibrationTable(points: { confidence: number; correct: boolean }[], edges = CALIBRATION_EDGES): CalibrationBin[] {
  const bins: CalibrationBin[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const lo = edges[i];
    const hi = Math.min(1, edges[i + 1]);
    const inBin = points.filter((p) => p.confidence >= lo && (p.confidence < edges[i + 1]));
    const correct = inBin.filter((p) => p.correct).length;
    bins.push({ lo, hi, n: inBin.length, accuracy: inBin.length ? correct / inBin.length : 0 });
  }
  return bins;
}

/** Expected calibration error (lower is better). */
export function expectedCalibrationError(points: { confidence: number; correct: boolean }[]): number {
  const bins = calibrationTable(points);
  const n = points.length || 1;
  let ece = 0;
  for (const b of bins) {
    if (!b.n) continue;
    const inBin = points.filter((p) => p.confidence >= b.lo && p.confidence < (b.hi >= 1 ? 1.0001 : b.hi));
    const meanConf = inBin.reduce((s, p) => s + p.confidence, 0) / b.n;
    ece += (b.n / n) * Math.abs(meanConf - b.accuracy);
  }
  return ece;
}
