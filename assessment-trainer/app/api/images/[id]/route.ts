import { deleteImage } from "@/lib/database/repo";
import { json, error } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ok = await deleteImage(params.id);
  return ok ? json({ ok: true }) : error("Question not found", 404);
}
