// Pick the recognition alternative that best matches the expected Quran text.
//
// The browser recogniser returns up to N alternative transcripts per result.
// Its top guess is tuned for everyday Arabic, so for Quranic recitation an
// alternative often matches the verse wording better. Scoring is deliberately
// cheap (it runs on every interim result): the fraction of an alternative's
// normalised tokens that appear in the expected word set.

import { tokenize } from "@/lib/arabic";

export function pickBestAlternative(alternatives: string[], expectedSet: Set<string>): string {
  if (alternatives.length <= 1) return alternatives[0] ?? "";
  let best = alternatives[0];
  let bestScore = -1;
  for (const alt of alternatives) {
    const tokens = tokenize(alt);
    if (tokens.length === 0) continue;
    let hits = 0;
    for (const t of tokens) if (expectedSet.has(t)) hits++;
    const score = hits / tokens.length;
    if (score > bestScore) {
      bestScore = score;
      best = alt;
    }
  }
  return best;
}
