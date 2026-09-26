/**
 * In-browser screenshot analysis: same stages and JSON contract as the Python
 * pipeline (python/vision/pipeline.py), implemented on plain pixel arrays.
 */
import type { Cell } from "../../matrigma/types";
import type { VisionResult } from "../types";
import { adaptiveInk, normalize, resize, toGray, type Gray } from "./raster";
import { DetectionError, detectLayout, latticeBox, latticeMissing, slotBox, type Box } from "./detect";
import { extractObjects } from "./objects";

export interface RgbaImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export function analyzeRgba(img: RgbaImage): VisionResult {
  const t0 = Date.now();
  const steps: string[] = ["decode"];
  let g: Gray = toGray(img.data, img.width, img.height);
  steps.push("grayscale");
  let scale = 1;
  const maxD = Math.max(g.w, g.h);
  const minD = Math.min(g.w, g.h);
  if (maxD > 2000) scale = 2000 / maxD;
  else if (minD < 600) scale = Math.min(2, 600 / minD);
  if (scale !== 1) {
    g = resize(g, Math.round(g.w * scale), Math.round(g.h * scale));
    steps.push(`resize x${scale.toFixed(2)}`);
  } else steps.push("resize (none needed)");
  g = normalize(g);
  steps.push("contrast normalisation");
  const block = Math.max(15, Math.floor(Math.min(g.w, g.h) / 40) | 1);
  const ink = adaptiveInk(g, block, 12);
  steps.push("adaptive threshold");
  const orig = (b: Box | number[]) => {
    const [x, y, w, h] = Array.isArray(b) ? b : [b.x, b.y, b.w, b.h];
    return [x, y, w, h].map((v) => Math.round(v / scale));
  };
  const base = { imageSize: [img.width, img.height] as [number, number], preprocessing: steps };
  let layout;
  try {
    layout = detectLayout(ink, g);
  } catch (e) {
    if (e instanceof DetectionError) {
      return {
        ...base,
        ok: false,
        stage: e.stage,
        error: e.message,
        region: e.region ? orig(e.region) : null,
        candidateBoxes: e.boxes.slice(0, 60).map((b) => orig(b)),
        timings: { total_ms: Date.now() - t0 },
      };
    }
    throw e;
  }
  const lat = layout.matrix;
  if (!layout.missing) {
    const n = latticeMissing(lat).length;
    return {
      ...base,
      ok: false,
      stage: "missing_cell",
      error: n === 0 ? "No missing cell could be identified (every grid slot contains a cell)." : `${n} grid slots have no detected cell; expected exactly one missing cell.`,
      region: orig(latticeBox(lat)),
      candidateBoxes: [...lat.cells.values()].map((b) => orig(b)),
      timings: { total_ms: Date.now() - t0 },
    };
  }
  let textureCells = 0;
  let wireCells = 0;
  let nestedCells = 0;
  const cells: (Cell | null)[] = [];
  const debugCells = [];
  const qualities: number[] = [];
  for (let r = 0; r < lat.rows; r++)
    for (let c = 0; c < lat.cols; c++) {
      const box = lat.cells.get(`${r},${c}`);
      if (!box) {
        cells.push(null);
        debugCells.push({ row: r, col: c, box: orig(slotBox(lat, r, c)), missing: true, objects: [] });
        continue;
      }
      const { objects, quality, texture, wire, nested } = extractObjects(g, box);
      if (texture) textureCells++;
      if (wire) wireCells++;
      if (nested) nestedCells++;
      qualities.push(quality);
      cells.push({ objects: objects.map(({ shape, fill, size, rotation, x, y }) => ({ shape, fill, size, rotation, x, y })) } as Cell);
      debugCells.push({
        row: r,
        col: c,
        box: orig(box),
        missing: false,
        objects: objects.map((o) => ({ ...o, bbox: orig([box.x + o.bbox[0], box.y + o.bbox[1], o.bbox[2], o.bbox[3]]) })),
      });
    }
  const options: Cell[] = [];
  const debugOptions = [];
  for (const b of layout.options) {
    const { objects, quality, texture, wire, nested } = extractObjects(g, b);
    if (texture) textureCells++;
    if (wire) wireCells++;
    if (nested) nestedCells++;
    qualities.push(quality);
    options.push({ objects: objects.map(({ shape, fill, size, rotation, x, y }) => ({ shape, fill, size, rotation, x, y })) } as Cell);
    debugOptions.push({ box: orig(b), objects: objects.map((o) => ({ ...o, bbox: orig([b.x + o.bbox[0], b.y + o.bbox[1], o.bbox[2], o.bbox[3]]) })) });
  }
  if (textureCells >= 2 || wireCells >= 3 || nestedCells >= 3) {
    textureCells = Math.max(textureCells, wireCells, nestedCells);
    return {
      ...base,
      ok: false,
      stage: "objects",
      error: `${textureCells} cells contain line patterns or overlapping figures, which the rule solver cannot read from an image.`,
      region: orig(latticeBox(lat)),
      candidateBoxes: [...lat.cells.values()].map((b) => orig(b)),
      timings: { total_ms: Date.now() - t0 },
    };
  }
  const sizes = [...lat.cells.values()].map((b) => b.w);
  const mean = sizes.reduce((s, v) => s + v, 0) / sizes.length;
  const std = Math.sqrt(sizes.reduce((s, v) => s + (v - mean) ** 2, 0) / sizes.length);
  const regularity = 1 - Math.min(1, (std / Math.max(mean, 1)) * 5);
  const empty = cells.filter((c) => c && !c.objects.length).length + options.filter((o) => !o.objects.length).length;
  const objQ = qualities.length ? qualities.reduce((s, v) => s + v, 0) / qualities.length : 0;
  const quality = objQ * (0.7 + 0.3 * regularity) * (empty ? 0.6 : 1) * (layout.inferredOptions ? 0.85 : 1);
  return {
    ...base,
    ok: true,
    matrix: { rows: lat.rows, columns: lat.cols },
    missingCell: layout.missing,
    answerOptions: options.length,
    problem: { rows: lat.rows, cols: lat.cols, cells, options },
    quality: Math.round(quality * 1000) / 1000,
    qualityFactors: { objects: objQ, gridRegularity: regularity, emptyCells: empty, inferredOptions: layout.inferredOptions },
    debug: { matrixBox: orig(latticeBox(lat)), cells: debugCells, options: debugOptions },
    timings: { total_ms: Date.now() - t0 },
    provider: "browser",
  };
}
