"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Trash2 } from "lucide-react";
import type { MatrixProblem } from "@/lib/matrigma/types";
import { CATEGORY_LABELS, DIFFICULTIES, MATRIGMA_CATEGORIES, OPTION_LABELS, type MatrigmaCategory } from "@/lib/matrigma/types";
import { PageHeader } from "@/components/page-header";
import { MatrixGrid, OptionGrid } from "@/components/matrix-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label, Select } from "@/components/ui/field";

interface Row {
  id: string;
  source: string;
  category: string | null;
  difficulty: string;
  rule: string;
  problem: MatrixProblem;
  correctAnswer: number | null;
  solverAnswer: number | null;
  solverConfidence: number | null;
  solverStrategy: string | null;
  verified: boolean;
  hasImage: boolean;
  attempts: number;
  createdAt: string;
}

export default function QuestionBank() {
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [genCat, setGenCat] = useState<string>("");
  const [genDiff, setGenDiff] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ limit: "100" });
    if (source) qs.set("source", source);
    if (category) qs.set("category", category);
    setRows(await fetch(`/api/questions?${qs}`).then((r) => r.json()));
  }, [source, category]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    setBusy(true);
    await fetch("/api/questions/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 10, category: genCat || undefined, difficulty: genDiff || undefined }),
    });
    setBusy(false);
    void load();
  }

  async function remove(id: string) {
    await fetch(`/api/questions?id=${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <>
      <PageHeader title="Question bank" description="Generated questions (known solution) and analysed screenshots. Each question stores its rule, difficulty and the solver's verdict." />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Generate 10 new questions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="gc">Category</Label>
            <Select id="gc" value={genCat} onChange={(e) => setGenCat(e.target.value)} className="w-48">
              <option value="">Mixed</option>
              {MATRIGMA_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gd">Difficulty</Label>
            <Select id="gd" value={genDiff} onChange={(e) => setGenDiff(e.target.value)} className="w-40">
              <option value="">Default</option>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "Generate"}
          </Button>
        </CardContent>
      </Card>

      <div className="mb-3 flex flex-wrap gap-3">
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-44" aria-label="Filter by source">
          <option value="">All sources</option>
          <option value="generated">Generated</option>
          <option value="screenshot">Screenshots</option>
        </Select>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44" aria-label="Filter by category">
          <option value="">All categories</option>
          {MATRIGMA_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </Select>
        <span className="self-center text-sm text-muted-foreground">{rows.length} questions</span>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{r.source}</Badge>
                  {r.category && <Badge>{CATEGORY_LABELS[r.category as MatrigmaCategory] ?? r.category}</Badge>}
                  <Badge variant="outline">{r.difficulty}</Badge>
                  {r.solverConfidence !== null && (
                    <Badge variant={r.correctAnswer === null ? "outline" : r.solverAnswer === r.correctAnswer ? "good" : "bad"}>
                      solver {r.solverAnswer === null ? "abstained" : OPTION_LABELS[r.solverAnswer]} · {Math.round(r.solverConfidence * 100)}%
                    </Badge>
                  )}
                  {r.hasImage && <Badge variant="warn">image stored</Badge>}
                </div>
                <p className="truncate text-sm text-muted-foreground">{r.rule || "—"}</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => setOpen(open === r.id ? null : r.id)} aria-label="Preview">
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Delete question">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {open === r.id && (
              <CardContent className="grid gap-4 lg:grid-cols-[320px_1fr]">
                <MatrixGrid problem={r.problem} />
                <div className="space-y-3">
                  <OptionGrid options={r.problem.options} correct={r.correctAnswer} disabled />
                  <p className="text-sm">
                    <b>Correct:</b> {r.correctAnswer === null ? "unknown" : OPTION_LABELS[r.correctAnswer]} · <b>Rule:</b> {r.rule}
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No questions yet — generate some above or start a practice session.</p>}
      </div>
    </>
  );
}
