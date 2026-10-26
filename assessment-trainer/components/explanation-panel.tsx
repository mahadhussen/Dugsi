import type { Explanation } from "@/lib/solver/types";
import { Card, CardContent } from "@/components/ui/card";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border py-2.5 first:border-t-0 sm:grid-cols-[140px_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** QUESTION TYPE / RULE / VALIDATION / MISSING CELL / ANSWER / CONFIDENCE block. */
export function ExplanationPanel({ explanation: e, ruleFromGenerator, narrative }: { explanation: Explanation; ruleFromGenerator?: string; narrative?: string | null }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <dl>
          <Row label="Question type">{e.questionType}</Row>
          {ruleFromGenerator && <Row label="Rule (by design)">{ruleFromGenerator}</Row>}
          <Row label="Rule (verified)">
            {e.rules.length ? (
              <ul className="list-disc space-y-1 pl-4">
                {e.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : (
              "No rule could be verified."
            )}
          </Row>
          <Row label="Validation">{e.validation.length ? e.validation.join(" · ") : "—"}</Row>
          {e.missingCell.length > 0 && (
            <Row label="Missing cell">
              <ul className="space-y-0.5">
                {e.missingCell.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </Row>
          )}
          <Row label="Answer">
            <span className="font-semibold">{e.answer}</span>
          </Row>
          <Row label="Confidence">{e.confidence}</Row>
          {narrative && <Row label="In plain words">{narrative}</Row>}
          {e.notes.length > 0 && (
            <Row label="Notes">
              <ul className="space-y-0.5 text-muted-foreground">
                {e.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </Row>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
