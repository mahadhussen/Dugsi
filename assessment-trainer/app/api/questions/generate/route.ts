import { generateQuestion } from "@/lib/matrigma/generator";
import { MATRIGMA_CATEGORIES, DIFFICULTIES, type Difficulty, type MatrigmaCategory } from "@/lib/matrigma/types";
import { saveGenerated, getAttempts } from "@/lib/database/repo";
import { computeStats } from "@/lib/statistics/stats";
import { pickAdaptive } from "@/lib/statistics/adaptive";
import { body, error, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/**
 * POST { count, category?, difficulty?, adaptive? }
 * Returns questions WITHOUT the correct answer; correctness is checked by
 * POST /api/attempts.
 */
export async function POST(req: Request) {
  const b = await body<{ count?: number; category?: string; difficulty?: string; adaptive?: boolean }>(req);
  const count = Math.max(1, Math.min(50, Number(b.count ?? 5)));
  if (b.category && !(MATRIGMA_CATEGORIES as readonly string[]).includes(b.category)) return error("Unknown category");
  if (b.difficulty && !DIFFICULTIES.includes(b.difficulty as Difficulty)) return error("Unknown difficulty");
  let plan: { category?: MatrigmaCategory; difficulty?: Difficulty }[];
  if (b.adaptive) {
    const stats = computeStats(await getAttempts());
    plan = pickAdaptive(stats.byCategory, count);
  } else {
    plan = Array.from({ length: count }, () => ({ category: b.category as MatrigmaCategory | undefined, difficulty: b.difficulty as Difficulty | undefined }));
  }
  const out = [];
  for (const p of plan) {
    const q = generateQuestion(p);
    const saved = await saveGenerated(q);
    out.push({ id: saved.id, category: q.category, difficulty: q.difficulty, problem: q.problem });
  }
  return json(out);
}
