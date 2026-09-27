import { prisma } from "@/lib/database/client";
import { getUser } from "@/lib/database/repo";
import { body, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await body<{ kind?: string; mode?: string; questionCount?: number; perQuestionSeconds?: number | null; totalSeconds?: number | null }>(req);
  const u = await getUser();
  const s = await prisma.practiceSession.create({
    data: {
      userId: u.id,
      kind: b.kind ?? "matrigma",
      mode: b.mode ?? "free",
      questionCount: b.questionCount ?? 0,
      perQuestionSeconds: b.perQuestionSeconds ?? null,
      totalSeconds: b.totalSeconds ?? null,
    },
  });
  return json(s);
}

export async function GET() {
  const u = await getUser();
  return json(await prisma.practiceSession.findMany({ where: { userId: u.id }, orderBy: { startedAt: "desc" }, take: 20 }));
}
