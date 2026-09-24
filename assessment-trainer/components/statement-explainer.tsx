import type { StatementAnalysis } from "@/lib/map/classify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Explains a personality statement without suggesting an answer. */
export function StatementExplainer({ analysis: a }: { analysis: StatementAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What does this statement mean?</CardTitle>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {a.relatedTraits.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
          {a.method !== "bank" && (
            <Badge variant={a.confidence >= 0.6 ? "default" : "warn"}>classification confidence {Math.round(a.confidence * 100)}%</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>{a.interpretation}</p>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What behaviour does it describe?</p>
          <p>{a.behaviour}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">Agreeing</p>
            <p>{a.agreeMeans}</p>
          </div>
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">Disagreeing</p>
            <p>{a.disagreeMeans}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Neither end is better. Different roles and teams benefit from different styles.</p>
      </CardContent>
    </Card>
  );
}
