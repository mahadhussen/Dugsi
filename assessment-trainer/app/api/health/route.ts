import { pythonHealth } from "@/lib/vision/python";
import { providerSummary } from "@/lib/ai";
import { json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ python: await pythonHealth(), providers: providerSummary() });
}
