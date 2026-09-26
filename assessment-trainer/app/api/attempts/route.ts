import { prisma } from "@/lib/database/client";
import { recordAttempt, getAttempts } from "@/lib/database/repo";
import { solveMatrix } from "@/lib/solver/solve";
import { body, error, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** Record an answer; returns correctness plus the verified explanation. */
export async function POST(req: Request) {
  const b = await body<{ questionId?: string; selectedAnswer?: number | null; responseTime?: number; sessionId?: string }>(req);
  if (!b.questionId || typeof b.responseTime !== "number") return error("questionId and responseTime are required");
  try {
    const r = await recordAttempt({ questionId: b.questionId, selectedAnswer: b.selectedAnswer ?? null, responseTime: b.responseTime, sessionId: b.sessionId });
    const q = await prisma.question.findUniqueOrThrow({ where: { id: b.questionId } });
    const solution = solveMatrix(JSON.parse(q.payload));
    return json({ isCorrect: r.isCorrect, correctAnswer: r.correctAnswer, rule: q.rule, explanation: solution.explanation, predicted: solution.predicted, solverAnswer: solution.answer });
  } catch (e) {
    return error((e as Error).message, 404);
  }
}

export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  return json(await getAttempts(limit));
}
