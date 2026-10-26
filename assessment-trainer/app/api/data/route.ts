import { clearAllData, deleteAllImages, deleteHistory } from "@/lib/database/repo";
import { clearVisionCache } from "@/lib/vision/python";
import { json, error } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** DELETE ?scope=images|history|all */
export async function DELETE(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope");
  clearVisionCache();
  if (scope === "images") return json({ ok: true, deleted: await deleteAllImages() });
  if (scope === "history") {
    await deleteHistory();
    return json({ ok: true });
  }
  if (scope === "all") {
    await clearAllData();
    return json({ ok: true });
  }
  return error("scope must be images, history or all");
}
