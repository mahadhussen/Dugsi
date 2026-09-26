"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* Chart roles come from CSS variables (see globals.css) so light/dark are both selected, not flipped. */
const SERIES = "var(--series-1)";
const GRID = "var(--chart-grid)";
const TEXT = "var(--chart-text)";
const REF = "var(--chart-ref)";

const axis = { stroke: GRID, tick: { fill: TEXT, fontSize: 11 }, tickLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" },
  labelStyle: { color: "hsl(var(--muted-foreground))" },
  cursor: { stroke: REF, strokeWidth: 1 },
};

function Empty({ text = "No data yet — complete a few practice questions." }: { text?: string }) {
  return <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">{text}</div>;
}

const FORMATS = {
  percent: (v: number) => `${Math.round(v * 100)}%`,
  seconds: (v: number) => `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}s`,
};

export function TimeSeriesChart({ data, dataKey, unit, label }: { data: Record<string, number | string>[]; dataKey: string; unit: keyof typeof FORMATS; label: string }) {
  if (data.length === 0) return <Empty />;
  const format = FORMATS[unit];
  const domain: [number | string, number | string] = unit === "percent" ? [0, 1] : [0, "auto"];
  return (
    <div className="h-56" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => d.slice(5)} />
          <YAxis {...axis} axisLine={false} domain={domain} tickFormatter={format} width={48} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => [format(v), label]} />
          <Line isAnimationActive={false} type="monotone" dataKey={dataKey} stroke={SERIES} strokeWidth={2} dot={{ r: 4, fill: SERIES, stroke: "hsl(var(--card))", strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBarChart({ data, label }: { data: { key: string; accuracy: number; attempts: number }[]; label: string }) {
  if (data.length === 0) return <Empty />;
  return (
    <div className="h-64" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barCategoryGap={6}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 1]} {...axis} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
          <YAxis type="category" dataKey="key" {...axis} axisLine={false} width={88} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} formatter={(v: number, _n, p) => [`${Math.round(v * 100)}% (${p.payload.attempts} attempts)`, "Accuracy"]} />
          <Bar isAnimationActive={false} dataKey="accuracy" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Observed accuracy per confidence bin (a well calibrated bin is correct as often as its confidence says). */
export function CalibrationChart({ bins }: { bins: { lo: number; hi: number; n: number; accuracy: number }[] }) {
  const data = bins.filter((b) => b.n > 0).map((b) => ({ bin: `${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%`, accuracy: b.accuracy, ideal: (b.lo + b.hi) / 2, n: b.n }));
  if (!data.length) return <Empty text="No predictions with known answers yet." />;
  return (
    <div className="h-56" role="img" aria-label="Confidence calibration">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="bin" {...axis} />
          <YAxis domain={[0, 1]} {...axis} axisLine={false} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} width={48} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} formatter={(v: number, name: string, p) => (name === "accuracy" ? [`${Math.round(v * 100)}% correct (n=${p.payload.n})`, "Observed"] : [`${Math.round(v * 100)}%`, "Ideal"])} />
          <ReferenceLine y={0.9} stroke={REF} strokeDasharray="4 4" />
          <Bar isAnimationActive={false} dataKey="accuracy" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
