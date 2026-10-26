import { prisma } from "@/lib/database/client";
import { ensureSeeded, getUser } from "@/lib/database/repo";
import { json } from "@/lib/api/http";
import { SUBSCALES } from "@/lib/map/model";
import { describe } from "@/lib/map/classify";

export const dynamic = "force-dynamic";

/**
 * GET ?count=10 — practice statements, preferring ones not yet answered, and
 * mixing in facets so related statements appear in the same session.
 */
export async function GET(req: Request) {
  await ensureSeeded();
  const count = Math.min(40, Number(new URL(req.url).searchParams.get("count") ?? 10));
  const u = await getUser();
  const answered = new Set((await prisma.mAPResponse.findMany({ where: { userId: u.id }, select: { statementId: true } })).map((r) => r.statementId));
  const all = await prisma.mAPStatement.findMany({ where: { source: "bank" } });
  const shuffled = all.sort(() => Math.random() - 0.5);
  const fresh = shuffled.filter((s) => !answered.has(s.id));
  // Pick facets, then two statements per facet so consistency can be reflected on.
  const picked: typeof all = [];
  for (const s of [...fresh, ...shuffled]) {
    if (picked.length >= count) break;
    if (picked.includes(s)) continue;
    picked.push(s);
    const sibling = [...fresh, ...shuffled].find((x) => x.subscale === s.subscale && !picked.includes(x));
    if (sibling && picked.length < count) picked.push(sibling);
  }
  const out = picked.sort(() => Math.random() - 0.5).map((s) => {
    const sub = SUBSCALES.find((x) => x.key === s.subscale)!;
    return { id: s.id, text: s.text, subscale: s.subscale, domain: s.domain, analysis: describe(s.text, sub, s.keyed === -1 ? -1 : 1, 1, "bank") };
  });
  return json(out);
}
