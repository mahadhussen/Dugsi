"use client";

import { useEffect, useState } from "react";
import { SUBSCALES } from "@/lib/map/model";
import { Progress } from "@/components/ui/progress";

interface Data {
  consistency: { subscale: string; n: number; consistency: number }[];
}

export function MapConsistency() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    fetch("/api/map/responses")
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD({ consistency: [] }));
  }, []);
  if (!d) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!d.consistency.length) return <p className="text-sm text-muted-foreground">Answer at least two statements about the same trait to see this.</p>;
  return (
    <div className="space-y-2">
      {d.consistency.map((c) => (
        <div key={c.subscale}>
          <div className="flex justify-between text-sm">
            <span>{SUBSCALES.find((s) => s.key === c.subscale)?.name ?? c.subscale}</span>
            <span className="text-xs text-muted-foreground">
              {c.n} statements · {Math.round(c.consistency * 100)}% similar
            </span>
          </div>
          <Progress value={c.consistency} />
        </div>
      ))}
    </div>
  );
}
