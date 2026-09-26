import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import type { VisionResult } from "./types";

/**
 * Bridge to the Python/OpenCV pipeline (python/vision). The image is streamed
 * over stdin; nothing is written to disk. Results are cached by image hash so
 * re-analysing the same screenshot does not repeat preprocessing.
 */
const CACHE_MAX = 32;
const cache = new Map<string, VisionResult>();

export function pythonDir(): string {
  return process.env.PYTHON_VISION_DIR ?? path.join(process.cwd(), "python");
}

function pythonBin(): string {
  return process.env.PYTHON_BIN || "python3";
}

export function imageHash(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function run(args: string[], input?: Buffer, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), ["-m", "vision.cli", ...args], { cwd: pythonDir() });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Vision pipeline timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Could not start Python (${pythonBin()}): ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Vision pipeline exited with ${code}: ${Buffer.concat(err).toString().slice(-500)}`));
      else resolve(Buffer.concat(out).toString());
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

export async function analyzeWithPython(image: Buffer): Promise<VisionResult> {
  const key = imageHash(image);
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = await run([], image);
  const result = JSON.parse(raw) as VisionResult;
  cache.set(key, result);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return result;
}

export async function pythonHealth(): Promise<{ ok: boolean; opencv?: string; error?: string }> {
  try {
    return JSON.parse(await run(["--health"], undefined, 15_000));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function clearVisionCache() {
  cache.clear();
}
