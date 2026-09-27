import { analyzeImage, validateUpload } from "@/lib/api/analyze";
import { error } from "@/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST multipart/form-data { file, mode?: auto|matrigma|map }
 * Streams NDJSON: progress events, then {"result": ...}.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const f = file instanceof File ? file : null;
  const invalid = validateUpload(f);
  if (invalid) return error(invalid, 400);
  const mode = (String(form?.get("mode") ?? "auto") as "auto" | "matrigma" | "map") || "auto";
  const buffer = Buffer.from(await f!.arrayBuffer());
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await analyzeImage(buffer, f!.type, mode, (e) => send({ event: e }));
        send({ result });
      } catch (e) {
        send({ result: { type: "error", message: "Unable to reliably detect the matrix.", problem: (e as Error).message, stage: "internal" } });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
