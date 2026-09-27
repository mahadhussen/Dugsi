"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Link2 } from "lucide-react";
import { LIKERT } from "@/lib/map/model";
import type { StatementAnalysis } from "@/lib/map/classify";
import { PageHeader } from "@/components/page-header";
import { StatementExplainer } from "@/components/statement-explainer";
import { useHotkeys } from "@/components/use-hotkeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Label, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface Statement {
  id: string;
  text: string;
  analysis: StatementAnalysis;
}

interface Related {
  a: { id: string; text: string; value: number };
  b: { id: string; text: string; value: number };
  message: string;
}

export default function MapPractice() {
  const [items, setItems] = useState<Statement[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [related, setRelated] = useState<Related[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [custom, setCustom] = useState("");
  const [customErr, setCustomErr] = useState<string | null>(null);
  const started = useRef(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/map/statements?count=10").then((x) => x.json());
    setItems(r);
    setIdx(0);
    setAnswer(null);
    setSaved(false);
    setRelated([]);
    setLoading(false);
    started.current = Date.now();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items[idx];

  const save = useCallback(
    async (value: number) => {
      if (!current || saved) return;
      setAnswer(value);
      const r = await fetch("/api/map/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statementId: current.id, value, responseTime: Date.now() - started.current }),
      }).then((x) => x.json());
      setRelated(r.related ?? []);
      setSaved(true);
    },
    [current, saved],
  );

  const next = useCallback(() => {
    if (!saved) return;
    setIdx((i) => i + 1);
    setAnswer(null);
    setSaved(false);
    setRelated([]);
    setShowHelp(false);
    started.current = Date.now();
  }, [saved]);

  const hotkeys = useMemo(() => {
    const h: Record<string, () => void> = { Enter: next, n: next, " ": () => setShowHelp((s) => !s), r: () => !saved && setAnswer(null) };
    for (let i = 1; i <= 7; i++) h[String(i)] = () => void save(i);
    return h;
  }, [next, save, saved]);
  useHotkeys(hotkeys, !!current);

  async function addCustom() {
    setCustomErr(null);
    const r = await fetch("/api/map/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: custom }) });
    const j = await r.json();
    if (!r.ok) return setCustomErr(j.error);
    setItems((prev) => [...prev.slice(0, idx + (saved ? 1 : 0)), { id: j.statementId, text: custom, analysis: j.analysis }, ...prev.slice(idx + (saved ? 1 : 0))]);
    if (saved) next();
    setCustom("");
  }

  return (
    <>
      <PageHeader
        title="Personality practice"
        description="Practise understanding statements and answering them consistently. There is no correct answer — this tool never tells you what to answer."
      />
      <Alert title="How to use this" className="mb-4">
        Answer as you honestly are. Open “What does this statement mean?” to see which behaviour it describes. When two statements about the same behaviour get
        very different answers, you’ll see a note — reflect on the difference; you don’t have to change anything.
      </Alert>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !current ? (
        <Card className="p-6">
          <p className="font-semibold">Session complete</p>
          <p className="mt-1 text-sm text-muted-foreground">You reflected on {items.length} statements. See Statistics for how consistent related answers were.</p>
          <Button className="mt-4" onClick={load}>
            New set of statements
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Progress value={idx / items.length} />
            <Card>
              <CardHeader>
                <CardDescription>
                  Statement {idx + 1} of {items.length}
                </CardDescription>
                <p className="text-xl font-medium leading-snug">“{current.text}”</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-7" role="radiogroup" aria-label="Your answer">
                  {LIKERT.map((l) => (
                    <button
                      key={l.value}
                      role="radio"
                      aria-checked={answer === l.value}
                      disabled={saved}
                      onClick={() => save(l.value)}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition-colors sm:flex-col sm:text-center",
                        answer === l.value ? "border-primary bg-accent text-primary" : "border-border hover:border-primary/50",
                      )}
                    >
                      <span className="font-semibold tabular-nums">{l.value}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowHelp(!showHelp)}>
                    <HelpCircle className="h-4 w-4" /> What does this statement mean? (Space)
                  </Button>
                  {saved && (
                    <Button size="sm" onClick={next}>
                      Next (N)
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            {showHelp && <StatementExplainer analysis={current.analysis} />}
            {saved &&
              related.map((r, i) => (
                <Card key={i} className="border-warn/40">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-warn" aria-hidden /> These statements appear related.
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p>
                      “{r.a.text}” — you answered <b>{LIKERT[r.a.value - 1].label}</b>
                    </p>
                    <p>
                      “{r.b.text}” — you answered <b>{LIKERT[r.b.value - 1].label}</b>
                    </p>
                    <p className="text-muted-foreground">{r.message}</p>
                  </CardContent>
                </Card>
              ))}
          </div>
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Add your own statement</CardTitle>
              <CardDescription>Type a practice statement to get an explanation of what it describes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor="custom">Statement</Label>
              <Textarea id="custom" rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Jag planerar alltid mitt arbete noggrant." />
              {customErr && <p className="text-xs text-bad">{customErr}</p>}
              <Button size="sm" onClick={addCustom} disabled={!custom.trim()}>
                Add to session
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
