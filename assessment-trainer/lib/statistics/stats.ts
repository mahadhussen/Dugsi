import { calibrationTable } from "./calibration";
import type { CalibrationBin } from "../solver/confidence";

export interface AttemptLike {
  isCorrect: boolean;
  responseTime: number;
  category: string;
  difficulty: string;
  confidence: number | null;
  timestamp: Date | string;
}

export interface GroupStat {
  key: string;
  attempts: number;
  correct: number;
  accuracy: number;
  avgTimeMs: number;
}

export interface Stats {
  total: number;
  correct: number;
  accuracy: number;
  avgTimeMs: number;
  medianTimeMs: number;
  byCategory: GroupStat[];
  byDifficulty: GroupStat[];
  overTime: { day: string; attempts: number; accuracy: number; avgTimeMs: number }[];
  weakest: GroupStat[];
  strongest: GroupStat[];
  fastest: GroupStat | null;
  thisWeek: number;
  calibration: CalibrationBin[];
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function group(attempts: AttemptLike[], key: (a: AttemptLike) => string): GroupStat[] {
  const map = new Map<string, AttemptLike[]>();
  for (const a of attempts) {
    const k = key(a);
    map.set(k, [...(map.get(k) ?? []), a]);
  }
  return [...map.entries()].map(([k, list]) => {
    const correct = list.filter((a) => a.isCorrect).length;
    return {
      key: k,
      attempts: list.length,
      correct,
      accuracy: correct / list.length,
      avgTimeMs: list.reduce((s, a) => s + a.responseTime, 0) / list.length,
    };
  });
}

export function dayKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export function computeStats(attempts: AttemptLike[], now = new Date(), minForRanking = 3): Stats {
  const total = attempts.length;
  const correct = attempts.filter((a) => a.isCorrect).length;
  const times = attempts.map((a) => a.responseTime);
  const byCategory = group(attempts, (a) => a.category).sort((a, b) => a.key.localeCompare(b.key));
  const byDifficulty = group(attempts, (a) => a.difficulty);
  const overTime = group(attempts, (a) => dayKey(a.timestamp))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => ({ day: g.key, attempts: g.attempts, accuracy: g.accuracy, avgTimeMs: g.avgTimeMs }));
  const ranked = byCategory.filter((g) => g.attempts >= minForRanking);
  const weakest = [...ranked].sort((a, b) => a.accuracy - b.accuracy || b.avgTimeMs - a.avgTimeMs).slice(0, 3);
  const strongest = [...ranked].sort((a, b) => b.accuracy - a.accuracy || a.avgTimeMs - b.avgTimeMs).slice(0, 3);
  const fastest = [...ranked].sort((a, b) => a.avgTimeMs - b.avgTimeMs)[0] ?? null;
  const weekAgo = now.getTime() - 7 * 24 * 3600 * 1000;
  const thisWeek = attempts.filter((a) => new Date(a.timestamp).getTime() >= weekAgo).length;
  const calibration = calibrationTable(
    attempts.filter((a) => a.confidence !== null).map((a) => ({ confidence: a.confidence as number, correct: a.isCorrect })),
  );
  return {
    total,
    correct,
    accuracy: total ? correct / total : 0,
    avgTimeMs: total ? times.reduce((s, t) => s + t, 0) / total : 0,
    medianTimeMs: median(times),
    byCategory,
    byDifficulty,
    overTime,
    weakest,
    strongest,
    fastest,
    thisWeek,
    calibration,
  };
}
