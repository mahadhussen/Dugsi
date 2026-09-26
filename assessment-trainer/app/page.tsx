import Link from "next/link";
import { ArrowRight, Clock, Target, TrendingDown, Zap } from "lucide-react";
import { ensureSeeded, getStats } from "@/lib/database/repo";
import { CATEGORY_LABELS, type MatrigmaCategory } from "@/lib/matrigma/types";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { TimeSeriesChart } from "@/components/charts";
import { pct, secs } from "@/lib/utils";

export const dynamic = "force-dynamic";

const label = (k: string) => CATEGORY_LABELS[k as MatrigmaCategory] ?? k;

export default async function Dashboard() {
  await ensureSeeded();
  const s = await getStats();
  const matrigmaAcc = s.total ? pct(s.accuracy) : "—";
  const weakest = s.weakest[0];
  return (
    <>
      <PageHeader title="Dashboard" description="Your practice at a glance. All data stays on this computer.">
        <Button asChild>
          <Link href="/practice/matrigma">
            Start practice <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total questions" value={String(s.total)} />
        <StatTile label="Correct answers" value={String(s.correct)} />
        <StatTile label="Accuracy (matrices)" value={matrigmaAcc} />
        <StatTile label="Average response time" value={s.total ? secs(s.avgTimeMs) : "—"} hint={s.total ? `median ${secs(s.medianTimeMs)}` : undefined} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-bad" aria-hidden /> Your weakest matrix category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weakest ? (
              <>
                <p className="text-xl font-semibold">{label(weakest.key)}</p>
                <p className="text-sm text-muted-foreground">
                  {pct(weakest.accuracy)} correct over {weakest.attempts} attempts
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={`/practice/matrigma?category=${weakest.key}`}>Practice {label(weakest.key)}</Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Answer at least 3 questions in a category to see this.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" aria-hidden /> Your fastest category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {s.fastest ? (
              <>
                <p className="text-xl font-semibold">{label(s.fastest.key)}</p>
                <p className="text-sm text-muted-foreground">
                  {secs(s.fastest.avgTimeMs)} on average · {pct(s.fastest.accuracy)} correct
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not enough data yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" aria-hidden /> Questions solved this week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{s.thisWeek}</p>
            <p className="text-sm text-muted-foreground">in the last 7 days</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Accuracy over time</CardTitle>
            <CardDescription>Share of matrix questions answered correctly per day</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={s.overTime} dataKey="accuracy" label="Accuracy" unit="percent" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average response time over time</CardTitle>
            <CardDescription>Seconds per question, per day</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={s.overTime} dataKey="avgTimeMs" label="Avg. response time" unit="seconds" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4" aria-hidden /> Categories
            </CardTitle>
            <CardDescription>Weakest and strongest (min. 3 attempts)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Weakest</p>
              {s.weakest.length ? (
                s.weakest.map((g) => (
                  <div key={g.key} className="mb-2">
                    <div className="flex justify-between text-sm">
                      <span>{label(g.key)}</span>
                      <span className="tabular-nums text-muted-foreground">{pct(g.accuracy)}</span>
                    </div>
                    <Progress value={g.accuracy} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Strongest</p>
              {s.strongest.length ? (
                s.strongest.map((g) => (
                  <div key={g.key} className="mb-2">
                    <div className="flex justify-between text-sm">
                      <span>{label(g.key)}</span>
                      <span className="tabular-nums text-muted-foreground">{pct(g.accuracy)}</span>
                    </div>
                    <Progress value={g.accuracy} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Personality practice</CardTitle>
            <CardDescription>Statements you have reflected on (there are no right answers)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{pct(s.map.completion)}</p>
            <p className="mb-3 text-sm text-muted-foreground">
              {s.map.distinctStatements} of {s.map.bankSize} practice statements · {s.map.responses} answers
            </p>
            <Progress value={s.map.completion} />
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/practice/map">Continue</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent attempts</CardTitle>
          </CardHeader>
          <CardContent>
            {s.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attempts yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {s.recent.slice(0, 7).map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <span>
                      {label(a.category)} <span className="text-xs text-muted-foreground">· {a.difficulty}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">{secs(a.responseTime)}</span>
                      <Badge variant={a.isCorrect ? "good" : "bad"}>{a.isCorrect ? "✓ Correct" : "✗ Wrong"}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
