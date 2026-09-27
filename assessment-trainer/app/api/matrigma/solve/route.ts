import { solveMatrix } from "@/lib/solver/solve";
import { body, error, json } from "@/lib/api/http";
import type { MatrixProblem } from "@/lib/matrigma/types";

export const dynamic = "force-dynamic";

/** Solve a structured problem (JSON), e.g. from the question bank or tests. */
export async function POST(req: Request) {
  const { problem } = await body<{ problem?: MatrixProblem }>(req);
  if (!problem || !Array.isArray(problem.cells) || !Array.isArray(problem.options)) return error("problem with cells and options is required");
  if (problem.cells.length !== problem.rows * problem.cols) return error("cells must have rows*cols entries");
  return json(solveMatrix(problem));
}
