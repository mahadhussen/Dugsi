import { prisma } from "@/lib/database/client";
import { getUser } from "@/lib/database/repo";
import { body, error, json } from "@/lib/api/http";
import { relatedPairs, consistencyIndex, type AnsweredStatement } from "@/lib/map/consistency";

export const dynamic = "force-dynamic";

async function answered(userId: string): Promise<AnsweredStatement[]> {
  const rs = await prisma.mAPResponse.findMany({ where: { userId }, include: { statement: true }, orderBy: { timestamp: "desc" } });
  // Latest answer per statement
  const seen = new Set<string>();
  const out: AnsweredStatement[] = [];
  for (const r of rs) {
    if (seen.has(r.statementId)) continue;
    seen.add(r.statementId);
    out.push({ id: r.statementId, text: r.statement.text, subscale: r.statement.subscale, keyed: r.statement.keyed === -1 ? -1 : 1, value: r.value });
  }
  return out;
}

/** Save a practice answer (1..7). Returns related statements that point in a different direction. */
export async function POST(req: Request) {
  const b = await body<{ statementId?: string; value?: number; responseTime?: number; sessionId?: string }>(req);
  if (!b.statementId || typeof b.value !== "number" || b.value < 1 || b.value > 7) return error("statementId and value 1..7 are required");
  const st = await prisma.mAPStatement.findUnique({ where: { id: b.statementId } });
  if (!st) return error("Statement not found", 404);
  const u = await getUser();
  await prisma.mAPResponse.create({
    data: { userId: u.id, statementId: st.id, value: Math.round(b.value), responseTime: Math.round(b.responseTime ?? 0), sessionId: b.sessionId ?? null, category: st.domain },
  });
  const all = await answered(u.id);
  const related = relatedPairs(all).filter((p) => p.a.id === st.id || p.b.id === st.id);
  return json({ ok: true, related });
}

export async function GET() {
  const u = await getUser();
  const all = await answered(u.id);
  return json({ answers: all, related: relatedPairs(all).slice(0, 20), consistency: consistencyIndex(all) });
}
