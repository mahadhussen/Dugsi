import type { Cell } from "../matrigma/types";

export interface DebugObject {
  shape: string;
  fill: number;
  size: number;
  rotation: number;
  x: number;
  y: number;
  confidence: number;
  bbox: number[];
}

export interface VisionSuccess {
  ok: true;
  imageSize: [number, number];
  preprocessing: string[];
  matrix: { rows: number; columns: number };
  missingCell: [number, number];
  answerOptions: number;
  problem: { rows: number; cols: number; cells: (Cell | null)[]; options: Cell[] };
  quality: number;
  qualityFactors: Record<string, number>;
  debug: {
    matrixBox: number[];
    cells: { row: number; col: number; box: number[]; missing: boolean; objects: DebugObject[] }[];
    options: { box: number[]; objects: DebugObject[] }[];
  };
  timings: Record<string, number>;
  provider?: string;
}

export interface VisionFailure {
  ok: false;
  stage: string;
  error: string;
  imageSize?: [number, number];
  preprocessing?: string[];
  region?: number[] | null;
  candidateBoxes?: number[][];
  timings?: Record<string, number>;
  provider?: string;
}

export type VisionResult = VisionSuccess | VisionFailure;
