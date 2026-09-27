import { getStats, ensureSeeded } from "@/lib/database/repo";
import { json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  return json(await getStats());
}
