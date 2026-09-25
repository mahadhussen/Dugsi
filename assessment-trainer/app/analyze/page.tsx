"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardPaste, ImageUp, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type { Cell, MatrixProblem } from "@/lib/matrigma/types";
import { OPTION_LABELS } from "@/lib/matrigma/types";
import type { Solution } from "@/lib/solver/types";
import type { StatementAnalysis } from "@/lib/map/classify";
import type { VisionSuccess } from "@/lib/vision/types";
import type { AiMatrixReading, AiMatrixVerdict } from "@/lib/ai/matrix-reading";
import { LIKERT } from "@/lib/map/model";
import { PageHeader } from "@/components/page-header";
import { MatrixGrid, OptionGrid } from "@/components/matrix-view";
import { ExplanationPanel } from "@/components/explanation-panel";
import { StatementExplainer } from "@/components/statement-explainer";
import { VisionOverlay } from "@/components/vision-overlay";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Label, Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";

const STAGES = [
  { key: "uploading", label: "Uploading" },
  { key: "processing", label: "Processing image" },
  { key: "detecting", label: "Detecting matrix" },
  { key: "analyzing", label: "Analyzing pattern" },
  { key: "validating", label: "Validating solution" },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const MAX = 10 * 1024 * 1024;

type MatrigmaResult = {
  type: "matrigma";
  questionId: string;
  imageStored: boolean;
  vision: Omit<VisionSuccess, "problem">;
  problem: MatrixProblem;
  solution: Solution;
  narrative: string | null;
  unknownObjects: number;
  ai: AiReading | null;
};
type AiReading = { reading: AiMatrixReading; verdict: AiMatrixVerdict; durationMs: number };
type AiMatrixResult = { type: "ai-matrix"; localProblem: string } & AiReading;
type MapResult = { type: "map"; statementId: string; ocrText: string; ocrConfidence: number; analysis: StatementAnalysis; candidates: string[] };
type ErrorResult = {
  type: "error";
  message: string;
  problem: string;
  detail?: string;
  stage: string;
  region: number[] | null;
  candidateBoxes: number[][];
  imageSize: [number, number] | null;
};
type Result = MatrigmaResult | MapResult | ErrorResult | AiMatrixResult;

export default function AnalyzePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<"auto" | "matrigma" | "map">("auto");
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stages, setStages] = useState<Partial<Record<StageKey, { status: "active" | "done"; detail?: string }>>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const runningRef = useRef(false);

  // Dropping, pasting or choosing a file starts the analysis straight away.
  const pick = useCallback((f: File | undefined | null) => {
    setErr(null);
    setResult(null);
    setStages({});
    setPasteNote(null);
    if (!f) return;
    if (!ACCEPT.includes(f.type)) return setErr("Unsupported file type. Use PNG, JPG or WEBP.");
    if (f.size > MAX) return setErr("File is larger than 10 MB.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!runningRef.current) void analyze(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        pick(item.getAsFile());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pick]);

  async function pasteFromClipboard() {
    try {
      for (const it of await navigator.clipboard.read()) {
        const t = it.types.find((x) => x.startsWith("image/"));
        if (t) return pick(new File([await it.getType(t)], `clipboard.${t.split("/")[1]}`, { type: t }));
      }
      setPasteNote("There is no image on the clipboard. Copy a screenshot or an image first.");
    } catch {
      setPasteNote("The browser did not allow direct clipboard access. Press Ctrl+V (⌘V on Mac) instead.");
    }
  }

  async function analyze(target: File | null = file) {
    if (!target) return;
    runningRef.current = true;
    setRunning(true);
    setResult(null);
    setStages({ uploading: { status: "active" } });
    const fd = new FormData();
    fd.append("file", target);
    fd.append("mode", modeRef.current);
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(j.error);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);
          if (msg.event) setStages((s) => ({ ...s, [msg.event.stage]: { status: msg.event.status, detail: msg.event.detail } }));
          if (msg.result) setResult(msg.result);
        }
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  function clear() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setStages({});
  }

  return (
    <>
      <PageHeader
        title="Analyze screenshot"
        description="Upload a screenshot of a practice question. Matrices are solved by visual rule verification; personality statements are explained, never answered."
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pick(e.dataTransfer.files?.[0]);
                }}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Upload screenshot"
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                  dragOver ? "border-primary bg-accent" : "border-border hover:border-primary/50",
                )}
              >
                <ImageUp className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">Drop a screenshot here, click, or paste (Ctrl+V / ⌘V)</p>
                <p className="text-xs text-muted-foreground">PNG, JPG or WEBP · max 10 MB</p>
                <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={pasteFromClipboard} disabled={running}>
                  <ClipboardPaste className="h-4 w-4" /> Paste image
                </Button>
                <span className="text-xs text-muted-foreground">Analysis starts as soon as an image is added.</span>
              </div>
              {pasteNote && <p className="mt-2 text-xs text-muted-foreground">{pasteNote}</p>}
              {err && <p className="mt-3 text-sm text-bad">{err}</p>}
              {preview && !result && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Screenshot preview" className="mt-4 w-full rounded-md border border-border" />
              )}
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="mode">Question type</Label>
                <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                  <option value="auto">Detect automatically</option>
                  <option value="matrigma">Matrix (Matrigma-style)</option>
                  <option value="map">Personality statement (MAP-style)</option>
                </Select>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => analyze()} disabled={!file || running}>
                  {running && <Loader2 className="h-4 w-4 animate-spin" />} {result ? "Analyze again" : "Analyze"}
                </Button>
                {file && (
                  <Button variant="outline" onClick={clear} disabled={running}>
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          {Object.keys(stages).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {STAGES.map((s) => {
                    const st = stages[s.key];
                    return (
                      <li key={s.key} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5">
                          {st?.status === "done" ? (
                            <Check className="h-4 w-4 text-good" aria-label="done" />
                          ) : st?.status === "active" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="in progress" />
                          ) : (
                            <span className="block h-4 w-4 rounded-full border border-border" aria-label="pending" />
                          )}
                        </span>
                        <span>
                          <span className={cn(!st && "text-muted-foreground")}>{s.label}</span>
                          {st?.detail && <span className="block text-xs text-muted-foreground">{st.detail}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!result && !running && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Results appear here: detected matrix, objects, verified rule, predicted cell and the selected answer.
            </Card>
          )}
          {result?.type === "error" && <ErrorView result={result} preview={preview} onRetry={() => analyze()} />}
          {result?.type === "ai-matrix" && <AiMatrixView result={result} preview={preview} />}
          {result?.type === "matrigma" && <MatrigmaView result={result} preview={preview} />}
          {result?.type === "map" && <MapView result={result} />}
        </div>
      </div>
    </>
  );
}

function ErrorView({ result, preview, onRetry }: { result: ErrorResult; preview: string | null; onRetry: () => void }) {
  return (
    <>
      <Alert tone="bad" title={result.message}>
        <p>
          <b>Problem:</b> {result.problem}
        </p>
        {result.detail && result.detail !== result.problem && <p className="mt-1 text-xs">{result.detail}</p>}
        <p className="mt-1">No answer is guessed. Try a tighter crop around the matrix and options, a larger screenshot, or choose the question type manually.</p>
      </Alert>
      {preview && result.imageSize && (
        <Card>
          <CardHeader>
            <CardTitle>Detected region</CardTitle>
            <CardDescription>Orange: region that looked most like a grid. Grey: box-like shapes found.</CardDescription>
          </CardHeader>
          <CardContent>
            <VisionOverlay src={preview} size={result.imageSize} region={result.region} candidates={result.candidateBoxes} />
          </CardContent>
        </Card>
      )}
      <Button onClick={onRetry} variant="outline">
        <RefreshCw className="h-4 w-4" /> Retry
      </Button>
    </>
  );
}

function MatrigmaView({ result, preview }: { result: MatrigmaResult; preview: string | null }) {
  const s = result.solution;
  const [imageStored, setImageStored] = useState(result.imageStored);
  const [truth, setTruth] = useState<string>("");
  const [fbMsg, setFbMsg] = useState<string | null>(null);
  const tone = s.status === "solved" ? "good" : s.status === "uncertain" ? "warn" : "bad";
  async function sendFeedback() {
    if (truth === "") return;
    const r = await fetch("/api/analyze/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId: result.questionId, correctAnswer: Number(truth) }) }).then((x) => x.json());
    setFbMsg(r.solverWasCorrect ? "Thanks — recorded. The solver was right." : "Thanks — recorded. This helps calibrate the confidence score.");
  }
  async function deleteImage() {
    await fetch(`/api/images/${result.questionId}`, { method: "DELETE" });
    setImageStored(false);
  }
  return (
    <>
      <Alert
        tone={tone}
        title={
          s.status === "solved"
            ? `Answer ${s.answerLabel} · confidence ${Math.round(s.confidence * 100)}%`
            : s.status === "uncertain"
              ? `Uncertain – inspect manually${s.answerLabel ? ` (best candidate ${s.answerLabel}, ${Math.round(s.confidence * 100)}%)` : ""}`
              : "No verified rule found — no answer given"
        }
      >
        Strategy: {s.strategy ?? "—"} · {s.validated ? "rule verified on the complete rows/columns" : "not fully verified"} · extraction quality{" "}
        {Math.round(result.vision.quality * 100)}%{result.unknownObjects ? ` · ${result.unknownObjects} unrecognised object(s)` : ""}
      </Alert>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>1 · Original screenshot with detections</CardTitle>
            <CardDescription>Green: cells · orange dashed: missing cell · blue: answer options · thin boxes: detected objects (arrows show rotation)</CardDescription>
          </CardHeader>
          <CardContent>
            <VisionOverlay src={preview} size={result.vision.imageSize} debug={result.vision.debug} answer={s.answer} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>2 · Detected matrix → predicted missing cell</CardTitle>
            <CardDescription>Redrawn from the extracted representation ({result.vision.matrix.rows}×{result.vision.matrix.columns}).</CardDescription>
          </CardHeader>
          <CardContent>
            <MatrixGrid problem={result.problem} fill={s.predicted as Cell | null} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>3 · Detected objects</CardTitle>
          </CardHeader>
          <CardContent className="max-h-80 overflow-auto text-xs">
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Cell</th>
                  <th>Objects</th>
                </tr>
              </thead>
              <tbody>
                {result.vision.debug.cells.map((c) => (
                  <tr key={`${c.row}-${c.col}`} className="border-t border-border align-top">
                    <td className="py-1 pr-2 tabular-nums">
                      [{c.row},{c.col}]
                    </td>
                    <td className="py-1">
                      {c.missing
                        ? "missing"
                        : c.objects.map((o) => `${o.fill === 1 ? "solid" : o.fill === 0 ? "empty" : "half"} ${o.shape}${o.rotation ? ` ${o.rotation}°` : ""}`).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>4 · Answer options and match</CardTitle>
        </CardHeader>
        <CardContent>
          <OptionGrid options={result.problem.options} selected={s.answer} scores={s.optionScores} disabled />
        </CardContent>
      </Card>

      <ExplanationPanel explanation={s.explanation} narrative={result.narrative} />
      {result.ai && <AiReadingCard ai={result.ai} title="Second opinion from Claude" />}

      <Card>
        <CardHeader>
          <CardTitle>Independent strategies</CardTitle>
          <CardDescription>Agreement between strategies raises confidence; disagreement lowers it.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {s.strategies.map((st) => (
            <Badge key={st.id} variant={!st.informative ? "outline" : s.answer !== null && st.topOptions.includes(s.answer) ? "good" : "warn"}>
              {st.label}
              {st.informative ? ` → ${st.topOptions.map((i) => OPTION_LABELS[i]).join("/")}` : ""}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feedback & privacy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="truth">Correct answer (if you know it)</Label>
            <Select id="truth" value={truth} onChange={(e) => setTruth(e.target.value)} className="w-40">
              <option value="">—</option>
              {result.problem.options.map((_, i) => (
                <option key={i} value={i}>
                  {OPTION_LABELS[i]}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="outline" onClick={sendFeedback} disabled={truth === ""}>
            Save
          </Button>
          {imageStored ? (
            <Button variant="destructive" onClick={deleteImage}>
              <Trash2 className="h-4 w-4" /> Delete image
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">The screenshot was not stored (enable in Settings to keep images).</p>
          )}
          {fbMsg && <p className="w-full text-sm text-good">{fbMsg}</p>}
        </CardContent>
      </Card>
    </>
  );
}

function MapView({ result }: { result: MapResult }) {
  const [saved, setSaved] = useState<number | null>(null);
  async function answer(v: number) {
    await fetch("/api/map/responses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ statementId: result.statementId, value: v }) });
    setSaved(v);
  }
  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>Personality statement (read with OCR, confidence {Math.round(result.ocrConfidence * 100)}%)</CardDescription>
          <p className="text-xl font-medium">“{result.analysis.statement}”</p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Category: <b className="text-foreground">{result.analysis.category}</b> · facet: <b className="text-foreground">{result.analysis.subscaleName}</b>. There is no
          correct answer to this statement.
        </CardContent>
      </Card>
      <StatementExplainer analysis={result.analysis} />
      <Card>
        <CardHeader>
          <CardTitle>Practise answering (optional)</CardTitle>
          <CardDescription>Saved to your consistency practice only.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {LIKERT.map((l) => (
            <button
              key={l.value}
              onClick={() => answer(l.value)}
              className={cn("rounded-md border px-2 py-2 text-xs", saved === l.value ? "border-primary bg-accent text-primary" : "border-border hover:border-primary/50")}
            >
              {l.label}
            </button>
          ))}
        </CardContent>
      </Card>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Raw OCR text</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3">{result.ocrText}</pre>
      </details>
    </>
  );
}

function AiMatrixView({ result, preview }: { result: AiMatrixResult; preview: string | null }) {
  const v = result.verdict;
  return (
    <>
      <Alert
        tone={v.status === "solved" ? "good" : "warn"}
        title={v.status === "solved" ? `Answer ${v.answer} · Claude's confidence ${Math.round(v.confidence * 100)}%` : "Uncertain – inspect manually"}
      >
        {v.status === "solved"
          ? "Read by Claude because the rule solver does not know this layout. Not verified by the rule solver: follow the explanation below and check it yourself."
          : v.reason}{" "}
        <span className="text-xs">({result.localProblem})</span>
      </Alert>
      {preview && (
        <Card>
          <CardContent className="pt-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Analysed screenshot" className="mx-auto max-h-96 rounded-md border border-border" />
          </CardContent>
        </Card>
      )}
      <AiReadingCard ai={result} title="How Claude read it" />
    </>
  );
}

function AiReadingCard({ ai, title }: { ai: AiReading; title: string }) {
  const r = ai.reading;
  const v = ai.verdict;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" aria-hidden /> {title}
        </CardTitle>
        <CardDescription>
          {v.status === "solved" ? `Suggests ${v.answer} (${Math.round(v.confidence * 100)}%)` : "No answer: " + v.reason} · {(ai.durationMs / 1000).toFixed(0)} s · not verified by the rule
          solver
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>
          {r.layout.rows}×{r.layout.cols} matrix, empty cell at row {r.layout.emptyRow}, column {r.layout.emptyCol}, {r.options.length} options.
          {r.layout.notes && <span className="text-muted-foreground"> {r.layout.notes}</span>}
        </p>
        {r.explanation && <p className="font-medium">{r.explanation}</p>}
        {r.rules.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Rules</p>
            <ul className="list-disc space-y-1 pl-5">
              {r.rules.map((x, i) => (
                <li key={i}>
                  {x.holds ? "✓" : "✗"} {x.description} <span className="text-muted-foreground">({[x.part, x.appliesTo].filter(Boolean).join(", ")})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {r.prediction && (
          <p>
            <b>Missing cell:</b> {r.prediction}
          </p>
        )}
        {r.options.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Every option checked</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {r.options.map((o) => (
                <div key={o.label} className={cn("rounded-md border px-3 py-2 text-xs", o.matches ? "border-good bg-good/10" : "border-border")}>
                  <b className="mr-1.5">{o.label}</b>
                  {o.matches ? "fits" : o.difference || o.description}
                </div>
              ))}
            </div>
          </div>
        )}
        {r.cells.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">All {r.cells.length} cell descriptions</summary>
            <ul className="mt-2 space-y-1">
              {r.cells.map((c) => (
                <li key={`${c.row}-${c.col}`}>
                  <b>
                    R{c.row}C{c.col}
                  </b>{" "}
                  {c.description}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
