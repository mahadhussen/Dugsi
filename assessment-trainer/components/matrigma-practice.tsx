"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pause, Play, RotateCcw, SkipForward, Timer } from "lucide-react";
import type { Cell, Difficulty, MatrigmaCategory, MatrixProblem } from "@/lib/matrigma/types";
import { CATEGORY_LABELS, DIFFICULTIES, MATRIGMA_CATEGORIES, OPTION_LABELS } from "@/lib/matrigma/types";
import type { Explanation } from "@/lib/solver/types";
import { PageHeader } from "@/components/page-header";
import { MatrixGrid, OptionGrid } from "@/components/matrix-view";
import { ExplanationPanel } from "@/components/explanation-panel";
import { useHotkeys } from "@/components/use-hotkeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label, Select } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Alert } from "@/components/ui/alert";
import { cn, pct, secs } from "@/lib/utils";
import { FOCUS_LABELS, type RuleFocus } from "@/lib/matrigma/types";
import { abilityReport, nextItem, type ItemType, type TestResponse } from "@/lib/statistics/ability-test";

type Mode = "adaptive" | "category" | "timed" | "test";

interface Q {
  id: string;
  category: MatrigmaCategory;
  difficulty: Difficulty;
  problem: MatrixProblem;
}

interface Feedback {
  isCorrect: boolean;
  correctAnswer: number;
  rule: string;
  explanation: Explanation;
  predicted: Cell | null;
  selected: number | null;
  timeMs: number;
}

function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MatrigmaPractice() {
  const params = useSearchParams();
  const initialCategory = params.get("category") as MatrigmaCategory | null;
  const [mode, setMode] = useState<Mode>(initialCategory ? "category" : "adaptive");
  // A category, or a rule focus written as "focus:xor" / "focus:construction".
  const [category, setCategory] = useState<string>(initialCategory ?? "rotation");
  const [difficulty, setDifficulty] = useState<Difficulty | "auto">("auto");
  const [count, setCount] = useState<number>(10);
  const [perQuestion, setPerQuestion] = useState(60);

  const [phase, setPhase] = useState<"setup" | "loading" | "running" | "summary">("setup");
  const [err, setErr] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [results, setResults] = useState<(Feedback & { q: Q })[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [, setTick] = useState(0);

  // Timers are measured from timestamps, minus paused time.
  const qStart = useRef(0);
  const sStart = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const qPaused = useRef(0);
  const sPaused = useRef(0);
  const submitting = useRef(false);
  // Adaptive test: responses so far and the item type of the current question.
  const testResponses = useRef<TestResponse[]>([]);
  const testItem = useRef<ItemType | null>(null);

  const isTest = mode === "test";
  const timed = mode === "timed" || isTest;
  const totalLimitMs = mode === "timed" ? count * perQuestion * 1000 : null;
  const qLimitMs = timed ? perQuestion * 1000 : null;
  const total = isTest ? count : questions.length;

  async function fetchQuestions(body: Record<string, unknown>): Promise<Q[]> {
    const res = await fetch("/api/questions/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json()).error ?? "Could not generate questions");
    return res.json();
  }

  const now = () => (pausedAt.current ?? Date.now());
  const qElapsed = () => now() - qStart.current - qPaused.current;
  const sElapsed = () => now() - sStart.current - sPaused.current;

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [phase]);

  async function start() {
    setErr(null);
    setPhase("loading");
    try {
      let qs: Q[];
      if (isTest) {
        testResponses.current = [];
        testItem.current = nextItem([]);
        qs = await fetchQuestions({ count: 1, category: testItem.current.category, difficulty: testItem.current.difficulty });
      } else {
        qs = await fetchQuestions({
          count,
          adaptive: mode === "adaptive" || (timed && difficulty === "auto"),
          category: mode === "category" && !category.startsWith("focus:") ? category : undefined,
          focus: mode === "category" && category.startsWith("focus:") ? category.slice(6) : undefined,
          difficulty: difficulty === "auto" ? undefined : difficulty,
        });
      }
      const s = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "matrigma", mode, questionCount: isTest ? count : qs.length, perQuestionSeconds: qLimitMs ? perQuestion : null, totalSeconds: totalLimitMs ? totalLimitMs / 1000 : null }),
      }).then((r) => r.json());
      setSessionId(s.id);
      setQuestions(qs);
      setResults([]);
      setIdx(0);
      setSelected(null);
      setFeedback(null);
      setPaused(false);
      pausedAt.current = null;
      qPaused.current = 0;
      sPaused.current = 0;
      qStart.current = Date.now();
      sStart.current = Date.now();
      setPhase("running");
    } catch (e) {
      setErr((e as Error).message);
      setPhase("setup");
    }
  }

  const finish = useCallback(async () => {
    if (sessionId) await fetch(`/api/sessions/${sessionId}`, { method: "PATCH" }).catch(() => null);
    setPhase("summary");
  }, [sessionId]);

  const submit = useCallback(
    async (answer: number | null) => {
      if (feedback || submitting.current || phase !== "running") return;
      submitting.current = true;
      const q = questions[idx];
      const timeMs = qElapsed();
      try {
        const r = await fetch("/api/attempts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId: q.id, selectedAnswer: answer, responseTime: timeMs, sessionId }),
        }).then((x) => x.json());
        const fb: Feedback = { ...r, selected: answer, timeMs };
        setResults((prev) => [...prev, { ...fb, q }]);
        if (isTest) {
          // Test mode: no feedback between questions; the next item depends on this answer.
          const it = testItem.current!;
          testResponses.current = [...testResponses.current, { category: it.category, difficulty: it.difficulty, b: it.b, correct: !!r.isCorrect, timeMs }];
          if (testResponses.current.length >= count) {
            await finish();
            return;
          }
          testItem.current = nextItem(testResponses.current);
          const [nq] = await fetchQuestions({ count: 1, category: testItem.current.category, difficulty: testItem.current.difficulty });
          setQuestions((prev) => [...prev, nq]);
          setIdx((i) => i + 1);
          setSelected(null);
          qPaused.current = 0;
          qStart.current = Date.now();
          return;
        }
        setFeedback(fb);
        pausedAt.current = Date.now(); // stop the question clock while reviewing
      } finally {
        submitting.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feedback, phase, questions, idx, sessionId, isTest, count],
  );

  const next = useCallback(() => {
    if (!feedback) return;
    if (idx + 1 >= questions.length) {
      void finish();
      return;
    }
    // Review time does not count towards the session clock.
    if (pausedAt.current) sPaused.current += Date.now() - pausedAt.current;
    pausedAt.current = null;
    qPaused.current = 0;
    qStart.current = Date.now();
    setIdx(idx + 1);
    setSelected(null);
    setFeedback(null);
  }, [feedback, idx, questions.length, finish]);

  const togglePause = useCallback(() => {
    if (phase !== "running" || feedback) return;
    if (paused) {
      const d = Date.now() - (pausedAt.current ?? Date.now());
      qPaused.current += d;
      sPaused.current += d;
      pausedAt.current = null;
      setPaused(false);
    } else {
      pausedAt.current = Date.now();
      setPaused(true);
    }
  }, [phase, feedback, paused]);

  const reset = useCallback(() => {
    if (phase !== "running" || feedback || paused) return;
    setSelected(null);
    qPaused.current = 0;
    qStart.current = Date.now();
  }, [phase, feedback, paused]);

  // Time limits
  useEffect(() => {
    if (phase !== "running" || paused || feedback) return;
    if (qLimitMs && qElapsed() >= qLimitMs) void submit(selected);
    if (totalLimitMs && sElapsed() >= totalLimitMs) void finish();
  });

  const hotkeys = useMemo(() => {
    const h: Record<string, () => void> = {
      Enter: () => (feedback ? next() : selected !== null && !paused ? void submit(selected) : undefined),
      n: () => next(),
      r: () => reset(),
      " ": () => togglePause(),
    };
    for (let i = 1; i <= 6; i++) h[String(i)] = () => !feedback && !paused && setSelected(i - 1);
    return h;
  }, [feedback, next, reset, togglePause, selected, submit, paused]);
  useHotkeys(hotkeys, phase === "running");

  if (phase === "setup" || phase === "loading") {
    return (
      <>
        <PageHeader title="Matrix practice" description="Synthetic Matrigma-style matrices with known solutions. Adaptive mode focuses on your weakest categories." />
        {err && <Alert tone="bad" title="Could not start" className="mb-4">{err}</Alert>}
        <Card>
          <CardHeader>
            <CardTitle>New session</CardTitle>
            <CardDescription>Hotkeys: 1–6 choose · Enter submit · N next · R reset · Space pause</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="mode">Mode</Label>
              <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                <option value="adaptive">Adaptive (weak areas)</option>
                <option value="category">Single category or rule focus</option>
                <option value="timed">Timed test</option>
                <option value="test">Adaptive test (level estimate)</option>
              </Select>
            </div>
            {mode === "category" && (
              <div className="space-y-1.5">
                <Label htmlFor="category">Category</Label>
                <Select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {(Object.keys(FOCUS_LABELS) as RuleFocus[]).map((f) => (
                    <option key={f} value={`focus:${f}`}>
                      {FOCUS_LABELS[f]}
                    </option>
                  ))}
                  {MATRIGMA_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {!isTest && (<div className="space-y-1.5">
              <Label htmlFor="difficulty">Difficulty</Label>
              <Select id="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | "auto")}>
                <option value="auto">Automatic</option>
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d[0].toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </Select>
            </div>)}
            <div className="space-y-1.5">
              <Label htmlFor="count">Questions</Label>
              <Select id="count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </Select>
            </div>
            {isTest && (
              <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">
                One question at a time, no going back and no feedback until the end. Each answer moves the next question up or down in difficulty. The result is a
                level estimate on this tool&apos;s own questions, not a score from any real test.
              </p>
            )}
            {timed && (
              <div className="space-y-1.5">
                <Label htmlFor="perq">Seconds per question</Label>
                <Select id="perq" value={perQuestion} onChange={(e) => setPerQuestion(Number(e.target.value))}>
                  {[30, 45, 60, 90, 120].map((s) => (
                    <option key={s} value={s}>
                      {s} s{isTest ? "" : ` (session ${Math.round((s * count) / 60)} min)`}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex items-end sm:col-span-2 lg:col-span-4">
              <Button onClick={start} disabled={phase === "loading"} size="lg">
                {phase === "loading" ? "Generating…" : "Start"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (phase === "summary") {
    const correct = results.filter((r) => r.isCorrect).length;
    const avg = results.length ? results.reduce((s, r) => s + r.timeMs, 0) / results.length : 0;
    const byCat = new Map<string, { n: number; c: number }>();
    for (const r of results) {
      const g = byCat.get(r.q.category) ?? { n: 0, c: 0 };
      g.n++;
      g.c += r.isCorrect ? 1 : 0;
      byCat.set(r.q.category, g);
    }
    const report = isTest && testResponses.current.length ? abilityReport(testResponses.current) : null;
    return (
      <>
        <PageHeader title={report ? "Adaptive test results" : "Session results"} />
        {report && (
          <Card className="mb-3">
            <CardHeader>
              <CardTitle>Estimated level: {report.stanine} of 9</CardTitle>
              <CardDescription>
                Ability {report.theta.toFixed(2)} ± {report.se.toFixed(2)} on this tool&apos;s own scale (5 = middle). Hardest level solved: {report.hardestSolved ?? "none"}.
                This is an estimate from {report.total} synthetic questions, not a norm-referenced test score.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex gap-1" aria-label={`Level ${report.stanine} of 9`}>
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className={cn("h-3 flex-1 rounded-sm", i < report.stanine ? "bg-primary" : "bg-muted")} />
                ))}
              </div>
              {report.weakest.length > 0 && (
                <p>
                  Practise next:{" "}
                  {report.weakest.map((c, i) => (
                    <a key={c} className="text-primary underline" href={`/practice/matrigma?category=${c}`}>
                      {CATEGORY_LABELS[c]}
                      {i < report.weakest.length - 1 ? ", " : ""}
                    </a>
                  ))}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Score</p>
            <p className="text-3xl font-semibold tabular-nums">
              {correct} / {total}
            </p>
            <p className="text-sm text-muted-foreground">{results.length < total ? `${total - results.length} not reached (time ran out)` : "all answered"}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Accuracy</p>
            <p className="text-3xl font-semibold tabular-nums">{results.length ? pct(correct / results.length) : "—"}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Average time</p>
            <p className="text-3xl font-semibold tabular-nums">{secs(avg)}</p>
          </Card>
        </div>
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {results.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {i + 1}. {CATEGORY_LABELS[r.q.category]} <span className="text-xs text-muted-foreground">· {r.q.difficulty}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    you: {r.selected === null ? "—" : OPTION_LABELS[r.selected]} · correct: {OPTION_LABELS[r.correctAnswer]} · {secs(r.timeMs)}
                    <Badge variant={r.isCorrect ? "good" : "bad"}>{r.isCorrect ? "✓" : "✗"}</Badge>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...byCat.entries()].map(([k, g]) => (
                <Badge key={k} variant="outline">
                  {CATEGORY_LABELS[k as MatrigmaCategory]}: {g.c}/{g.n}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => setPhase("setup")}>New session</Button>
        </div>
      </>
    );
  }

  const q = questions[idx];
  const qLeft = qLimitMs ? qLimitMs - qElapsed() : null;
  const sLeft = totalLimitMs ? totalLimitMs - sElapsed() : null;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            Question {idx + 1} of {total}
          </h1>
          <div className="mt-1 flex gap-2">
            {!isTest && <Badge>{CATEGORY_LABELS[q.category]}</Badge>}
            {!isTest && <Badge variant="outline">{q.difficulty}</Badge>}
            {isTest && <Badge variant="outline">Adaptive test</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm tabular-nums">
          <span className={cn("flex items-center gap-1", qLeft !== null && qLeft < 10_000 && "font-semibold text-bad")}>
            <Timer className="h-4 w-4" aria-hidden /> {qLeft !== null ? fmtClock(qLeft) : fmtClock(qElapsed())}
          </span>
          <span className="text-muted-foreground">Session {sLeft !== null ? `${fmtClock(sLeft)} left` : fmtClock(sElapsed())}</span>
          <Button variant="outline" size="sm" onClick={togglePause} disabled={!!feedback} aria-label={paused ? "Resume" : "Pause"}>
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <Progress value={(idx + (feedback ? 1 : 0)) / total} className="mb-5" />

      <div className="relative">
        {paused && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <Card className="p-6 text-center">
              <p className="font-semibold">Paused</p>
              <p className="text-sm text-muted-foreground">Press Space to continue</p>
            </Card>
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <MatrixGrid problem={q.problem} hidden={paused} fill={feedback ? q.problem.options[feedback.correctAnswer] : null} fillLabel="answer" />
          <div className="space-y-4">
            <OptionGrid
              options={q.problem.options}
              selected={selected}
              onSelect={(i) => !feedback && setSelected(i)}
              disabled={!!feedback || paused}
              hidden={paused}
              correct={feedback ? feedback.correctAnswer : null}
              wrong={feedback && !feedback.isCorrect ? feedback.selected : null}
            />
            {!feedback ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => submit(selected)} disabled={selected === null || paused}>
                  Submit (Enter)
                </Button>
                <Button variant="outline" onClick={reset} disabled={paused}>
                  <RotateCcw className="h-4 w-4" /> Reset (R)
                </Button>
                <Button variant="ghost" onClick={() => submit(null)} disabled={paused}>
                  Skip
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Alert tone={feedback.isCorrect ? "good" : "bad"} title={feedback.isCorrect ? "Correct" : feedback.selected === null ? "No answer" : "Not quite"}>
                  The answer is {OPTION_LABELS[feedback.correctAnswer]}. You took {secs(feedback.timeMs)}.
                </Alert>
                <ExplanationPanel explanation={feedback.explanation} ruleFromGenerator={feedback.rule} />
                <Button onClick={next}>
                  {idx + 1 >= questions.length ? "See results" : "Next (N)"} <SkipForward className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
