/**
 * Extract the personality statement from OCR text of a screenshot. The
 * screenshot usually also contains Likert labels, buttons, progress text and
 * browser chrome; we remove those and keep the most sentence-like line.
 */
const NOISE = [
  /instämmer( inte)?( alls| helt| delvis)?/gi,
  /(strongly |somewhat )?(dis)?agree/gi,
  /\bneutral\b/gi,
  /\b(nästa|next|föregående|previous|tillbaka|back|skicka|submit)\b/gi,
  /\b(fråga|question)\s*\d+\s*(av|of)\s*\d+/gi,
  /https?:\/\/\S+/gi,
  /\b\d{1,2}:\d{2}\b/g,
  /\b\d+\s*%/g,
];

export function extractStatement(ocr: string): { statement: string; candidates: string[] } {
  const lines = ocr
    .split(/\n+/)
    .map((l) => {
      let t = l;
      for (const re of NOISE) t = t.replace(re, " ");
      return t.replace(/[|_~«»•]+/g, " ").replace(/\s+/g, " ").trim();
    })
    .filter((l) => l.length > 0);
  // Join lines that continue a sentence (no terminal punctuation).
  const merged: string[] = [];
  for (const l of lines) {
    const prev = merged[merged.length - 1];
    if (prev && !/[.!?]$/.test(prev) && /^[a-zåäö]/.test(l)) merged[merged.length - 1] = `${prev} ${l}`;
    else merged.push(l);
  }
  const candidates = merged
    .map((l) => l.replace(/^[^A-Za-zÅÄÖåäö]+/, "").trim())
    .filter((l) => l.split(" ").length >= 3 && /[a-zåäö]/i.test(l));
  const scored = candidates
    .map((c) => {
      const words = c.split(" ").length;
      const sentenceLike = /^(jag|i|my|min|mitt|mina|det|när|andra|people)\b/i.test(c) ? 3 : 0;
      const punct = /[.!?]$/.test(c) ? 1 : 0;
      const letters = c.replace(/[^A-Za-zÅÄÖåäö]/g, "").length / c.length;
      return { c, s: sentenceLike + punct + Math.min(words, 16) / 4 + letters * 2 };
    })
    .sort((a, b) => b.s - a.s);
  const best = scored[0]?.c ?? "";
  return { statement: best && !/[.!?]$/.test(best) ? `${best}.` : best, candidates: scored.map((x) => x.c) };
}
