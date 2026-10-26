import { SLOT_COORDS } from "./geometry";

/** Canonical object layouts for a given count (slot indices in a 3x3 grid). */
export const COUNT_LAYOUT_SLOTS: Record<number, number[]> = {
  1: [4],
  2: [3, 5],
  3: [3, 4, 5],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 1, 2, 6, 7, 8],
  7: [0, 1, 2, 4, 6, 7, 8],
  8: [0, 1, 2, 3, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

export function countLayout(n: number): [number, number][] {
  const slots = COUNT_LAYOUT_SLOTS[Math.max(1, Math.min(9, n))] ?? [];
  return slots.map((s) => SLOT_COORDS[s]);
}
