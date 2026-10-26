import { getSettings, updateSettings, type Settings } from "@/lib/database/repo";
import { body, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json(await getSettings());
}

export async function PUT(req: Request) {
  const b = await body<Partial<Settings>>(req);
  const patch: Partial<Settings> = {};
  if (typeof b.storeImages === "boolean") patch.storeImages = b.storeImages;
  if (typeof b.perQuestionSeconds === "number") patch.perQuestionSeconds = Math.max(10, Math.min(600, b.perQuestionSeconds));
  if (b.defaultSessionSize === 5 || b.defaultSessionSize === 10 || b.defaultSessionSize === 20) patch.defaultSessionSize = b.defaultSessionSize;
  return json(await updateSettings(patch));
}
