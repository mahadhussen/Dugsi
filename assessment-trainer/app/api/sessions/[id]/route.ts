import { prisma } from "@/lib/database/client";
import { computeStats } from "@/lib/statistics/stats";
import { json, error } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** Finish a session and store its summary. */
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const s = await prisma.practiceSession.findUnique({ where: { id: params.id }, include: { attempts: true } });
  if (!s) return error("Session not found", 404);
  const stats = computeStats(s.attempts);
  const summary = { total: stats.total, correct: stats.correct, accuracy: stats.accuracy, avgTimeMs: stats.avgTimeMs, byCategory: stats.byCategory };
  const updated = await prisma.practiceSession.update({ where: { id: s.id }, data: { endedAt: new Date(), summary: JSON.stringify(summary) } });
  return json({ ...updated, summary });
}
