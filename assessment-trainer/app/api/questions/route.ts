import { prisma } from "@/lib/database/client";
import { error, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
  const rows = await prisma.question.findMany({
    where: { type: "matrigma", source, category: category ? { key: category } : undefined },
    include: { category: true, _count: { select: { attempts: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return json(
    rows.map((q) => ({
      id: q.id,
      source: q.source,
      category: q.category?.key ?? null,
      difficulty: q.difficulty,
      rule: q.rule,
      problem: JSON.parse(q.payload),
      correctAnswer: q.correctAnswer,
      solverAnswer: q.solverAnswer,
      solverConfidence: q.solverConfidence,
      solverStrategy: q.solverStrategy,
      verified: q.verified,
      hasImage: !!q.imagePath,
      attempts: q._count.attempts,
      createdAt: q.createdAt,
    })),
  );
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return error("id is required");
  await prisma.question.delete({ where: { id } }).catch(() => null);
  return json({ ok: true });
}
