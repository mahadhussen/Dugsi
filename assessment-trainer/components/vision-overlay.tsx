"use client";

import { OPTION_LABELS } from "@/lib/matrigma/types";
import type { VisionSuccess } from "@/lib/vision/types";

/**
 * Screenshot with SVG overlays in image pixel coordinates: detected cells,
 * the missing cell, answer options, object boxes, rotation arrows and counts.
 */
export function VisionOverlay({
  src,
  size,
  debug,
  region,
  candidates,
  answer,
}: {
  src: string;
  size: [number, number];
  debug?: VisionSuccess["debug"];
  region?: number[] | null;
  candidates?: number[][];
  answer?: number | null;
}) {
  const [w, h] = size;
  const sw = Math.max(1.5, w / 500);
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Uploaded screenshot" className="block w-full" />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        {candidates?.map((b, i) => (
          <rect key={`c${i}`} x={b[0]} y={b[1]} width={b[2]} height={b[3]} fill="none" stroke="#94a3b8" strokeWidth={sw} />
        ))}
        {region && <rect x={region[0]} y={region[1]} width={region[2]} height={region[3]} fill="rgba(234,88,12,0.08)" stroke="#ea580c" strokeWidth={sw * 1.5} strokeDasharray="8 6" />}
        {debug && (
          <>
            <rect x={debug.matrixBox[0] - 4} y={debug.matrixBox[1] - 4} width={debug.matrixBox[2] + 8} height={debug.matrixBox[3] + 8} fill="none" stroke="#16a34a" strokeWidth={sw} strokeDasharray="4 4" />
            {debug.cells.map((c) => (
              <g key={`${c.row}-${c.col}`}>
                <rect x={c.box[0]} y={c.box[1]} width={c.box[2]} height={c.box[3]} fill={c.missing ? "rgba(234,88,12,0.12)" : "none"} stroke={c.missing ? "#ea580c" : "#16a34a"} strokeWidth={sw * 1.3} strokeDasharray={c.missing ? "6 4" : undefined} />
                {c.objects.length > 1 && (
                  <text x={c.box[0] + 4} y={c.box[1] + 14 * sw} fontSize={12 * sw} fill="#16a34a" fontWeight="bold">
                    ×{c.objects.length}
                  </text>
                )}
                {c.objects.map((o, i) => (
                  <ObjectMark key={i} o={o} sw={sw} color="#16a34a" />
                ))}
              </g>
            ))}
            {debug.options.map((o, i) => (
              <g key={`o${i}`}>
                <rect x={o.box[0]} y={o.box[1]} width={o.box[2]} height={o.box[3]} fill={answer === i ? "rgba(37,99,235,0.12)" : "none"} stroke="#2563eb" strokeWidth={sw * (answer === i ? 3 : 1.3)} />
                <text x={o.box[0] + 4} y={o.box[1] + 14 * sw} fontSize={12 * sw} fill="#2563eb" fontWeight="bold">
                  {OPTION_LABELS[i]}
                </text>
                {o.objects.map((ob, j) => (
                  <ObjectMark key={j} o={ob} sw={sw} color="#2563eb" />
                ))}
              </g>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}

function ObjectMark({ o, sw, color }: { o: { bbox: number[]; rotation: number; shape: string }; sw: number; color: string }) {
  const [x, y, w, h] = o.bbox;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.max(w, h) / 2;
  const a = (o.rotation * Math.PI) / 180;
  const showArrow = o.shape === "arrow" || o.shape === "triangle" || o.shape === "line";
  const ex = cx + Math.sin(a) * r * 0.9;
  const ey = cy - Math.cos(a) * r * 0.9;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={color} strokeWidth={sw * 0.7} opacity={0.7} />
      {showArrow && (
        <>
          <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#dc2626" strokeWidth={sw * 1.2} />
          <circle cx={ex} cy={ey} r={sw * 2} fill="#dc2626" />
        </>
      )}
    </g>
  );
}
