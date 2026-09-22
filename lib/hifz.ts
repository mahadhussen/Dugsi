// Memorisation (Hifz) masking: which word slots are hidden at each level.

/** Fraction of words hidden at each Hifz level. */
export function hideThreshold(level: number): number {
  return level === 1 ? 35 : level === 2 ? 70 : level >= 3 ? 100 : 0;
}

/** Deterministic per-word masking so the hidden set is stable across renders. */
export function isMaskedSlot(refIndex: number, level: number): boolean {
  if (level <= 0) return false;
  const h = Math.imul(refIndex + 1, 2654435761) >>> 0;
  return h % 100 < hideThreshold(level);
}
