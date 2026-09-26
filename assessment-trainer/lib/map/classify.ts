import { DOMAINS, SUBSCALES, type Subscale } from "./model";

export interface StatementAnalysis {
  statement: string;
  category: string; // domain name
  subscale: string; // subscale key
  subscaleName: string;
  keyed: 1 | -1;
  interpretation: string;
  behaviour: string;
  agreeMeans: string;
  disagreeMeans: string;
  relatedTraits: string[];
  confidence: number;
  method: "keywords" | "ai" | "bank";
}

const NEGATIONS = ["inte", "sällan", "aldrig", "ej", "not", "never", "rarely", "seldom", "don't", "doesn't", "hardly"];
// Words that in themselves describe the "low" end of a facet.
const LOW_POLE = [
  "oroar", "orolig", "nervös", "stressad", "irriterad", "tvivlar", "osäker", "rörigt", "skjuter upp", "misstänksam", "konflikt",
  "ensam", "spontant", "impulsiv", "rutiner", "beprövade", "tillräckligt bra", "worry", "nervous", "stressed", "irritated", "doubt",
  "messy", "put off", "procrastinat", "suspicious", "alone", "spontaneous", "routine", "good enough",
];

function norm(t: string): string {
  return t.toLowerCase().replace(/[“”"'.,!?;:()]/g, " ").replace(/\s+/g, " ").trim();
}

function score(s: Subscale, text: string): number {
  let sc = 0;
  for (const k of s.keywords) if (text.includes(k.toLowerCase())) sc += k.length > 5 ? 1.5 : 1;
  return sc;
}

/** Heuristic polarity: does agreeing express the high (+1) or low (-1) pole? */
export function polarity(statement: string): 1 | -1 {
  const t = ` ${norm(statement)} `;
  let p = 1;
  if (NEGATIONS.some((n) => t.includes(` ${n} `))) p = -p;
  if (LOW_POLE.some((w) => t.includes(w))) p = -p;
  return p as 1 | -1;
}

/**
 * Local (offline) classifier: keyword lexicon per subscale. Returns an
 * explanation of what the statement is about — never a "right" answer.
 */
export function classifyStatement(statement: string): StatementAnalysis {
  const text = norm(statement);
  const ranked = SUBSCALES.map((s) => ({ s, sc: score(s, text) })).sort((a, b) => b.sc - a.sc);
  const best = ranked[0];
  const second = ranked[1];
  const confidence = best.sc === 0 ? 0 : Math.min(0.95, 0.4 + 0.15 * best.sc - (second.sc === best.sc ? 0.2 : 0));
  const sub = best.sc > 0 ? best.s : SUBSCALES.find((s) => s.key === "deliberation")!;
  const keyed = polarity(statement);
  return describe(statement, sub, keyed, best.sc > 0 ? confidence : 0.1, "keywords", ranked.slice(1, 3).filter((r) => r.sc > 0).map((r) => r.s));
}

export function describe(
  statement: string,
  sub: Subscale,
  keyed: 1 | -1,
  confidence: number,
  method: StatementAnalysis["method"],
  alsoRelated: Subscale[] = [],
): StatementAnalysis {
  const dom = DOMAINS.find((d) => d.key === sub.domain)!;
  const highSide = keyed === 1 ? sub.high : sub.low;
  const lowSide = keyed === 1 ? sub.low : sub.high;
  return {
    statement,
    category: dom.name,
    subscale: sub.key,
    subscaleName: sub.name,
    keyed,
    interpretation: `This statement is about ${sub.name.toLowerCase()} (${dom.name}). ${dom.description}`,
    behaviour: keyed === 1 ? sub.high : sub.low,
    agreeMeans: `Describes someone who ${highSide.charAt(0).toLowerCase()}${highSide.slice(1)}`,
    disagreeMeans: `Describes someone who ${lowSide.charAt(0).toLowerCase()}${lowSide.slice(1)}`,
    relatedTraits: [sub.name, dom.name, ...alsoRelated.map((s) => s.name)].filter((v, i, a) => a.indexOf(v) === i),
    confidence,
    method,
  };
}

import { STATEMENT_BANK } from "./statements";

function tokens(t: string): Set<string> {
  return new Set(norm(t).split(" ").filter((w) => w.length > 2));
}

/** Fuzzy match against the practice bank (e.g. after OCR). */
export function matchBank(statement: string): { id: string; similarity: number } | null {
  const a = tokens(statement);
  let best: { id: string; similarity: number } | null = null;
  for (const s of STATEMENT_BANK) {
    const b = tokens(s.text);
    const inter = [...a].filter((x) => b.has(x)).length;
    const sim = inter / Math.max(1, new Set([...a, ...b]).size);
    if (!best || sim > best.similarity) best = { id: s.id, similarity: sim };
  }
  return best && best.similarity >= 0.6 ? best : null;
}

/** Classify, preferring an exact bank match (known facet and keying). */
export function analyzeStatement(statement: string): StatementAnalysis {
  const m = matchBank(statement);
  if (m) {
    const s = STATEMENT_BANK.find((x) => x.id === m.id)!;
    const sub = SUBSCALES.find((x) => x.key === s.subscale)!;
    return describe(statement, sub, s.keyed, 0.95, "bank");
  }
  return classifyStatement(statement);
}
