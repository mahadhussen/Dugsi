import { ensureSeeded, getStats } from "@/lib/database/repo";
import { CATEGORY_LABELS, type MatrigmaCategory } from "@/lib/matrigma/types";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalibrationChart, CategoryBarChart, TimeSeriesChart } from "@/components/charts";
import { MapConsistency } from "@/components/map-consistency";
import { pct, secs } from "@/lib/utils";

export const dynamic = "force-dynamic";

const label = (k: string) => CATEGORY_LABELS[k as MatrigmaCategory] ?? k;
const ORDER = ["easy", "medium", "hard", "expert"];

function CalibrationTable({ bins }: { bins: { lo: number; hi: number; n: number; accuracy: number }[] }) {
  const rows = bins.filter((b) => b.n > 0);
  if (!rows.length) return null;
  return (
    <table className="mt-3 w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1 font-medium">Confidence</th>
          <th className="py-1 text-right font-medium">Questions</th>
          <th className="py-1 text-right font-medium">Actually correct</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((b) => (
          <tr key={b.lo} className="border-t border-border">
            <td className="py-1.5">
              {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%
            </td>
            <td className="py-1.5 text-right">{b.n}</td>
            <td className="py-1.5 text-right">{pct(b.accuracy, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function StatisticsPage() {
  await ensureSeeded();
  const s = await getStats();
  const byDiff = [...s.byDifficulty].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  return (
    <>
      <PageHeader title="Statistics" description="Accuracy, speed and how well the solver's confidence matches reality." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Accuracy" value={s.total ? pct(s.accuracy, 1) : "—"} hint={`${s.correct} / ${s.total}`} />
        <StatTile label="Average response time" value={s.total ? secs(s.avgTimeMs) : "—"} />
        <StatTile label="Median response time" value={s.total ? secs(s.medianTimeMs) : "—"} />
        <StatTile label="This week" value={String(s.thisWeek)} hint="questions" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Accuracy by category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart label="Accuracy by category" data={s.byCategory.map((g) => ({ key: label(g.key), accuracy: g.accuracy, attempts: g.attempts }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By category and difficulty</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Group</th>
                  <th className="py-1 text-right font-medium">Attempts</th>
                  <th className="py-1 text-right font-medium">Accuracy</th>
                  <th className="py-1 text-right font-medium">Avg. time</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {s.byCategory.map((g) => (
                  <tr key={g.key} className="border-t border-border">
                    <td className="py-1.5">{label(g.key)}</td>
                    <td className="py-1.5 text-right">{g.attempts}</td>
                    <td className="py-1.5 text-right">{pct(g.accuracy)}</td>
                    <td className="py-1.5 text-right">{secs(g.avgTimeMs)}</td>
                  </tr>
                ))}
                {byDiff.map((g) => (
                  <tr key={g.key} className="border-t border-border bg-muted/40">
                    <td className="py-1.5 capitalize">Difficulty: {g.key}</td>
                    <td className="py-1.5 text-right">{g.attempts}</td>
                    <td className="py-1.5 text-right">{pct(g.accuracy)}</td>
                    <td className="py-1.5 text-right">{secs(g.avgTimeMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {s.total === 0 && <p className="mt-3 text-sm text-muted-foreground">No attempts yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Accuracy over time</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={s.overTime} dataKey="accuracy" label="Accuracy" unit="percent" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Response time over time</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={s.overTime} dataKey="avgTimeMs" label="Avg. response time" unit="seconds" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Solver confidence calibration</CardTitle>
            <CardDescription>
              Predicted confidence vs. actual correctness, from generated questions and from screenshots where you confirmed the answer. Dashed line: 90%. This
              table is fed back into the confidence score.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CalibrationChart bins={s.solverCalibration} />
            <CalibrationTable bins={s.solverCalibration} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Personality practice consistency</CardTitle>
            <CardDescription>How similarly you answered related statements. Not a score, and not right or wrong.</CardDescription>
          </CardHeader>
          <CardContent>
            <MapConsistency />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
