// Small decisions the listening pipeline takes the same way live and in the
// evaluation script, so what is measured is what ships.

export interface PieceSpan {
  /** Seconds on the recording clock. */
  t0: number;
  t1: number;
}

/** Longest stretch ever sent to the model in one go. Longer stretches are where
 *  it drops whole verses (measured on Al-Fatiha as one 46 s piece). */
export const MAX_DECODE_SECONDS = 18;

/**
 * Worth decoding this piece again together with the one before it?
 *
 * A long madd fades out and comes back, so the end of a word can arrive as a
 * piece of its own; decoded alone, a vowel tail makes the model invent a word
 * (measured: "مُؤْمِنُونَ" after "يُوقِنُونَ", "طسم" after "ٱلضَّآلِّينَ").
 * Only short pieces that gave at most two words and follow closely qualify.
 * Whether the joined decode is then used is the follower's call: it must fit
 * the text better than the two pieces apart (see fitScore).
 */
export function isJoinCandidate(prev: PieceSpan | null, cur: PieceSpan, curWords: number): boolean {
  if (!prev) return false;
  const gap = cur.t0 - prev.t1;
  return gap < 0.6 && cur.t1 - cur.t0 < 4.5 && curWords <= 2 && cur.t1 - prev.t0 <= MAX_DECODE_SECONDS;
}

/** Use the joined re-decode only when it fits the text clearly better than
 *  the two pieces apart. `fitApart` and `fitJoined` come from the follower's
 *  fitScore, measured from the same starting point. */
export function preferJoined(fitApart: number, fitJoined: number): boolean {
  return fitJoined > fitApart + 0.5;
}
