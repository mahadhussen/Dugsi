import type { Cell, GeneratedMatrixQuestion, MatrixObject, MatrixProblem } from "./types";
import { OPTION_LABELS } from "./types";
import { rotatePoint, shapePolygon } from "./geometry";

/**
 * Pure SVG-string renderer. Used by the React UI (inline SVG), by the test-data
 * generator (SVG -> PNG screenshots for the vision tests) and nowhere else, so
 * what the user practises on is exactly what the vision pipeline is tested on.
 */

const INK = "#111827";

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function objectSvg(o: MatrixObject, x0: number, y0: number, cell: number, uid: string): string {
  const cx = x0 + o.x * cell;
  const cy = y0 + o.y * cell;
  const r = o.size * cell * 0.4;
  const stroke = Math.max(2, cell * 0.025);
  const fillColor = o.fill === 1 ? INK : "none";
  const t = `translate(${fmt(cx)} ${fmt(cy)}) rotate(${fmt(o.rotation)})`;

  if (o.shape === "line") {
    return `<line x1="0" y1="${fmt(-r)}" x2="0" y2="${fmt(r)}" stroke="${INK}" stroke-width="${fmt(stroke * 1.6)}" stroke-linecap="butt" transform="${t}"/>`;
  }
  let outline: string;
  let body: string;
  if (o.shape === "circle") {
    outline = `<circle cx="0" cy="0" r="${fmt(r)}"`;
  } else {
    const pts = shapePolygon(o.shape, r).map(([px, py]) => `${fmt(px)},${fmt(py)}`).join(" ");
    outline = `<polygon points="${pts}"`;
  }
  body = `${outline} fill="${fillColor}" stroke="${INK}" stroke-width="${fmt(stroke)}" stroke-linejoin="miter"/>`;
  if (o.fill === 0.5) {
    // Left half solid, clipped to the shape. The half is defined in the
    // object's own frame so it rotates with the object.
    const clipId = `c${uid}`;
    const clip = `<clipPath id="${clipId}">${outline}/></clipPath>`;
    const half = `<rect x="${fmt(-r - 2)}" y="${fmt(-r - 2)}" width="${fmt(r + 2)}" height="${fmt(2 * r + 4)}" fill="${INK}" clip-path="url(#${clipId})"/>`;
    return `<g transform="${t}"><defs>${clip}</defs>${half}${body}</g>`;
  }
  return `<g transform="${t}">${body}</g>`;
}

export function cellSvgContent(cell: Cell, x0: number, y0: number, size: number, uid: string): string {
  return cell.objects.map((o, i) => objectSvg(o, x0, y0, size, `${uid}_${i}`)).join("");
}

export function renderCellSvg(cell: Cell | null, size = 120, uid = "cell"): string {
  const inner = cell ? cellSvgContent(cell, 0, 0, size, uid) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${inner}</svg>`;
}

export interface ScreenshotOptions {
  cell?: number;
  /** Add browser chrome, timer, instructions and buttons around the task. */
  chrome?: boolean;
  seed?: number;
}

/**
 * Render a full "test screen": optional browser chrome and UI noise, the
 * matrix with a dashed missing cell containing "?", and a row of answer boxes.
 */
export function renderScreenshotSvg(problem: MatrixProblem, opts: ScreenshotOptions = {}): {
  svg: string;
  width: number;
  height: number;
} {
  const cell = opts.cell ?? 110;
  const gap = 0;
  const chrome = opts.chrome ?? true;
  const optCell = Math.round(cell * 0.85);
  const optGap = Math.round(cell * 0.18);
  const nOpt = problem.options.length;
  const matrixW = problem.cols * cell + (problem.cols - 1) * gap;
  const matrixH = problem.rows * cell;
  const optionsW = nOpt * optCell + (nOpt - 1) * optGap;
  const contentW = Math.max(matrixW, optionsW);
  const width = contentW + (chrome ? 360 : 80);
  const top = chrome ? 150 : 40;
  const height = top + matrixH + 60 + optCell + (chrome ? 150 : 50);
  const mx = (width - matrixW) / 2;
  const my = top;
  const ox = (width - optionsW) / 2;
  const oy = my + matrixH + 60;
  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);
  if (chrome) {
    parts.push(`<rect x="0" y="0" width="${width}" height="44" fill="#dfe1e5"/>`);
    parts.push(`<circle cx="20" cy="22" r="6" fill="#ff5f57"/><circle cx="40" cy="22" r="6" fill="#febc2e"/><circle cx="60" cy="22" r="6" fill="#28c840"/>`);
    parts.push(`<rect x="90" y="10" width="${width - 180}" height="24" rx="12" fill="#ffffff"/>`);
    parts.push(`<text x="110" y="27" font-family="sans-serif" font-size="13" fill="#555">practice.local/matrix-training</text>`);
    parts.push(`<text x="30" y="85" font-family="sans-serif" font-size="18" font-weight="bold" fill="#222">Question 7 of 20</text>`);
    parts.push(`<text x="30" y="112" font-family="sans-serif" font-size="14" fill="#666">Which option completes the pattern?</text>`);
    parts.push(`<rect x="${width - 130}" y="66" width="100" height="34" rx="6" fill="#f3f4f6" stroke="#9ca3af"/>`);
    parts.push(`<text x="${width - 110}" y="89" font-family="monospace" font-size="16" fill="#111">00:42</text>`);
  }
  // Matrix cells
  for (let r = 0; r < problem.rows; r++) {
    for (let c = 0; c < problem.cols; c++) {
      const idx = r * problem.cols + c;
      const x = mx + c * (cell + gap);
      const y = my + r * cell;
      const cl = problem.cells[idx];
      if (cl === null) {
        parts.push(`<rect x="${x + 4}" y="${y + 4}" width="${cell - 8}" height="${cell - 8}" fill="#f9fafb" stroke="#9ca3af" stroke-width="2" stroke-dasharray="6 6"/>`);
        parts.push(`<text x="${x + cell / 2}" y="${y + cell / 2 + 14}" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#9ca3af">?</text>`);
      } else {
        parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#ffffff" stroke="#4b5563" stroke-width="2"/>`);
        parts.push(cellSvgContent(cl, x, y, cell, `m${idx}`));
      }
    }
  }
  // Answer options
  problem.options.forEach((o, i) => {
    const x = ox + i * (optCell + optGap);
    parts.push(`<rect x="${x}" y="${oy}" width="${optCell}" height="${optCell}" fill="#ffffff" stroke="#4b5563" stroke-width="2"/>`);
    parts.push(cellSvgContent(o, x, oy, optCell, `o${i}`));
    parts.push(`<text x="${x + optCell / 2}" y="${oy + optCell + 24}" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#374151">${OPTION_LABELS[i]}</text>`);
  });
  if (chrome) {
    parts.push(`<rect x="${width - 170}" y="${height - 70}" width="140" height="40" rx="8" fill="#2563eb"/>`);
    parts.push(`<text x="${width - 100}" y="${height - 44}" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#fff">Next</text>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`;
  return { svg, width, height };
}

export function questionScreenshotSvg(q: GeneratedMatrixQuestion, opts?: ScreenshotOptions) {
  return renderScreenshotSvg(q.problem, opts);
}
