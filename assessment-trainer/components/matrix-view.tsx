"use client";

import { memo } from "react";
import type { Cell, MatrixProblem } from "@/lib/matrigma/types";
import { OPTION_LABELS } from "@/lib/matrigma/types";
import { renderCellSvg } from "@/lib/matrigma/render";
import { cn } from "@/lib/utils";

export const CellSvg = memo(function CellSvg({ cell, size = 96, uid }: { cell: Cell | null; size?: number; uid: string }) {
  return <div className="matrix-tile" style={{ width: "100%", aspectRatio: "1" }} dangerouslySetInnerHTML={{ __html: renderCellSvg(cell, 120, uid).replace(/width="120" height="120"/, 'width="100%" height="100%"') }} />;
});

export function MatrixGrid({ problem, fill, hidden, fillLabel = "predicted" }: { problem: MatrixProblem; fill?: Cell | null; hidden?: boolean; fillLabel?: string }) {
  return (
    <div
      className={cn("mx-auto grid h-fit w-full max-w-[360px] self-start border-l border-t border-slate-500", hidden && "blur-md")}
      style={{ gridTemplateColumns: `repeat(${problem.cols}, minmax(0, 1fr))` }}
      aria-label={`${problem.rows} by ${problem.cols} matrix`}
    >
      {problem.cells.map((c, i) => (
        <div key={i} className="border-b border-r border-slate-500 bg-white">
          {c ? (
            <CellSvg cell={c} uid={`g${i}`} />
          ) : fill ? (
            <div className="relative">
              <CellSvg cell={fill} uid={`gf${i}`} />
              <span className="absolute right-1 top-1 rounded bg-primary px-1 text-[10px] font-semibold text-white">{fillLabel}</span>
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center bg-slate-50 text-3xl font-light text-slate-400" aria-label="missing cell">
              ?
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function OptionGrid({
  options,
  selected,
  correct,
  wrong,
  onSelect,
  disabled,
  hidden,
  scores,
}: {
  options: Cell[];
  selected?: number | null;
  correct?: number | null;
  wrong?: number | null;
  onSelect?: (i: number) => void;
  disabled?: boolean;
  hidden?: boolean;
  scores?: number[];
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-3 sm:grid-cols-6", hidden && "blur-md")} role="radiogroup" aria-label="Answer options">
      {options.map((o, i) => {
        const state = correct === i ? "correct" : wrong === i ? "wrong" : selected === i ? "selected" : "idle";
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={selected === i}
            disabled={disabled}
            onClick={() => onSelect?.(i)}
            className={cn(
              "group flex flex-col items-center gap-1 rounded-lg border-2 p-1.5 transition-all",
              state === "idle" && "border-border hover:border-primary/60",
              state === "selected" && "border-primary ring-2 ring-primary/30",
              state === "correct" && "border-good ring-2 ring-good/30",
              state === "wrong" && "border-bad ring-2 ring-bad/30",
            )}
          >
            <div className="w-full overflow-hidden rounded border border-slate-400">
              <CellSvg cell={o} uid={`o${i}`} />
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {OPTION_LABELS[i]} <span className="font-normal opacity-70">({i + 1})</span>
            </span>
            {scores && <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(scores[i] * 100)}% match</span>}
          </button>
        );
      })}
    </div>
  );
}
