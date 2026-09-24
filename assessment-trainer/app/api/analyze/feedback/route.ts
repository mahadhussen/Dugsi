import { prisma } from "@/lib/database/client";
import { body, error, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** The user tells us the actual correct option → improves confidence calibration. */
export async function POST(req: Request) {
  const { questionId, correctAnswer } = await body<{ questionId?: string; correctAnswer?: number }>(req);
  if (!questionId || typeof correctAnswer !== "number") return error("questionId and correctAnswer are required");
  const q = await prisma.question.update({ where: { id: questionId }, data: { correctAnswer, verified: true } }).catch(() => null);
  if (!q) return error("Question not found", 404);
  return json({ ok: true, solverWasCorrect: q.solverAnswer === correctAnswer });
}
