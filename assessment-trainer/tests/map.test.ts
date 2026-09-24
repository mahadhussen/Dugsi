import { describe, expect, it } from "vitest";
import { analyzeStatement, classifyStatement, polarity } from "@/lib/map/classify";
import { relatedPairs, consistencyIndex, traitPosition } from "@/lib/map/consistency";
import { extractStatement } from "@/lib/map/ocr-text";
import { SUBSCALES, DOMAINS } from "@/lib/map/model";
import { STATEMENT_BANK } from "@/lib/map/statements";

describe("MAP model", () => {
  it("has 5 domains and 25 subscales", () => {
    expect(DOMAINS).toHaveLength(5);
    expect(SUBSCALES).toHaveLength(25);
    for (const d of DOMAINS) expect(SUBSCALES.filter((s) => s.domain === d.key)).toHaveLength(5);
  });

  it("has statements for every subscale", () => {
    for (const s of SUBSCALES) expect(STATEMENT_BANK.some((b) => b.subscale === s.key)).toBe(true);
  });
});

describe("statement classification", () => {
  it("classifies the planning example", () => {
    const a = classifyStatement("Jag planerar alltid mitt arbete noggrant.");
    expect(a.category).toBe("Conscientiousness");
    expect(a.subscale).toBe("deliberation");
    expect(a.keyed).toBe(1);
    expect(a.relatedTraits).toContain("Conscientiousness");
  });

  it("detects reversed statements", () => {
    expect(polarity("Jag oroar mig ofta för saker.")).toBe(-1);
    expect(polarity("I rarely plan ahead.")).toBe(-1);
    expect(polarity("I enjoy meeting new people.")).toBe(1);
  });

  it("never presents an answer as correct", () => {
    const a = analyzeStatement("Jag trivs bäst när jag är omgiven av många människor.");
    const text = JSON.stringify(a).toLowerCase();
    expect(text).not.toMatch(/correct answer|right answer|you should answer/);
    expect(a.agreeMeans).toBeTruthy();
    expect(a.disagreeMeans).toBeTruthy();
  });

  it("matches OCR'd bank statements despite small errors", () => {
    const a = analyzeStatement("Jag planerar alltid mitt arbete noggrant");
    expect(a.method).toBe("bank");
  });

  it("classifies bank statements into their own facet (keyword coverage)", () => {
    const hits = STATEMENT_BANK.filter((s) => classifyStatement(s.text).subscale === s.subscale).length;
    expect(hits / STATEMENT_BANK.length).toBeGreaterThan(0.6);
  });
});

describe("MAP consistency engine", () => {
  const a = { id: "a", text: "I always plan carefully", subscale: "deliberation", keyed: 1 as const, value: 7 };
  const b = { id: "b", text: "I often decide spontaneously", subscale: "deliberation", keyed: -1 as const, value: 7 };
  it("reverse-keys answers", () => {
    expect(traitPosition(b)).toBe(1);
  });
  it("flags related statements answered in different directions", () => {
    const pairs = relatedPairs([a, b]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].message).toMatch(/These statements appear related/);
    expect(pairs[0].relation).toBe("opposite_direction");
  });
  it("does not flag consistent answers", () => {
    expect(relatedPairs([a, { ...b, value: 1 }])).toHaveLength(0);
    expect(consistencyIndex([a, { ...b, value: 1 }])[0].consistency).toBe(1);
  });
});

describe("MAP OCR text extraction", () => {
  it("extracts the statement from noisy screenshot text", () => {
    const ocr = `practice.local/personality\nFråga 12 av 80   04:31\n\nJag planerar alltid mitt\narbete noggrant.\n\nInstämmer inte alls  Instämmer inte  Neutral  Instämmer  Instämmer helt\nNästa`;
    expect(extractStatement(ocr).statement).toBe("Jag planerar alltid mitt arbete noggrant.");
  });
  it("handles English Likert labels", () => {
    const ocr = "Question 3 of 40\nI enjoy solving complex problems.\nStrongly disagree Disagree Neutral Agree Strongly agree\nNext";
    expect(extractStatement(ocr).statement).toBe("I enjoy solving complex problems.");
  });
});
