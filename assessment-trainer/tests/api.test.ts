import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as generate } from "@/app/api/questions/generate/route";
import { POST as attempt } from "@/app/api/attempts/route";
import { POST as solve } from "@/app/api/matrigma/solve/route";
import { POST as analyze } from "@/app/api/analyze/route";
import { GET as stats } from "@/app/api/stats/route";
import { GET as statements } from "@/app/api/map/statements/route";
import { POST as respond } from "@/app/api/map/responses/route";
import { POST as mapAnalyze } from "@/app/api/map/analyze/route";
import { DELETE as wipe } from "@/app/api/data/route";
import { GET as getSettings, PUT as putSettings } from "@/app/api/settings/route";
import { generateQuestion } from "@/lib/matrigma/generator";
import { clearAllData } from "@/lib/database/repo";
import { hasPython } from "./helpers";

const post = (body: unknown) => new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function readNdjson(res: Response) {
  const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  return { events: lines.filter((l) => l.event).map((l) => l.event), result: lines.find((l) => l.result)?.result };
}

describe("API", () => {
  beforeAll(async () => {
    await clearAllData();
  });

  it("generates questions without leaking the answer, then grades an attempt", async () => {
    const res = await generate(post({ count: 3, category: "rotation" }));
    const qs = await res.json();
    expect(qs).toHaveLength(3);
    expect(qs[0].correctAnswer).toBeUndefined();
    const r = await attempt(post({ questionId: qs[0].id, selectedAnswer: 0, responseTime: 1234 }));
    const j = await r.json();
    expect(typeof j.isCorrect).toBe("boolean");
    expect(j.explanation.questionType).toBe("3×3 matrix");
  });

  it("adaptive generation works", async () => {
    const qs = await (await generate(post({ count: 4, adaptive: true }))).json();
    expect(qs).toHaveLength(4);
  });

  it("validates input", async () => {
    expect((await generate(post({ category: "nope" }))).status).toBe(400);
    expect((await attempt(post({}))).status).toBe(400);
    expect((await solve(post({}))).status).toBe(400);
  });

  it("solves a structured problem", async () => {
    const q = generateQuestion({ category: "size", seed: 2 });
    const s = await (await solve(post({ problem: q.problem }))).json();
    expect(s.answer).toBe(q.correctAnswer);
  });

  it("stats endpoint", async () => {
    const s = await (await stats()).json();
    expect(s.total).toBeGreaterThanOrEqual(1);
    expect(s.map.bankSize).toBe(75);
  });

  it("MAP statements and responses", async () => {
    const list = await (await statements(new Request("http://x?count=6"))).json();
    expect(list.length).toBe(6);
    const same = list.filter((s: { subscale: string }) => s.subscale === list[0].subscale);
    const r1 = await (await respond(post({ statementId: same[0].id, value: 7 }))).json();
    expect(r1.ok).toBe(true);
    if (same.length > 1) {
      const keyedSame = same[0].analysis.keyed === same[1].analysis.keyed;
      const r2 = await (await respond(post({ statementId: same[1].id, value: keyedSame ? 1 : 7 }))).json();
      expect(r2.related.length).toBe(1);
    }
    expect((await respond(post({ statementId: list[0].id, value: 9 }))).status).toBe(400);
  });

  it("MAP analyze typed statement", async () => {
    const j = await (await mapAnalyze(post({ text: "Jag planerar alltid mitt arbete noggrant." }))).json();
    expect(j.analysis.category).toBe("Conscientiousness");
  });

  it("settings", async () => {
    const s = await (await putSettings(new Request("http://x", { method: "PUT", body: JSON.stringify({ storeImages: true }) }))).json();
    expect(s.storeImages).toBe(true);
    expect((await (await getSettings()).json()).storeImages).toBe(true);
    await putSettings(new Request("http://x", { method: "PUT", body: JSON.stringify({ storeImages: false }) }));
  });

  it("rejects bad uploads", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array([1])], "a.gif", { type: "image/gif" }));
    expect((await analyze(new Request("http://x", { method: "POST", body: fd }))).status).toBe(400);
    const big = new FormData();
    big.append("file", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "a.png", { type: "image/png" }));
    expect((await analyze(new Request("http://x", { method: "POST", body: big }))).status).toBe(400);
  });

  it.skipIf(!hasPython())("analyze upload flow: progress events and a verified answer", async () => {
    const dir = path.join(__dirname, "..", "test-data", "screenshots");
    const f = fs.readdirSync(dir).find((x) => x.startsWith("rotation") && x.endsWith(".png"))!;
    const truth = JSON.parse(fs.readFileSync(path.join(dir, f.replace(".png", ".json")), "utf8"));
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(fs.readFileSync(path.join(dir, f)))], f, { type: "image/png" }));
    fd.append("mode", "matrigma");
    const { events, result } = await readNdjson(await analyze(new Request("http://x", { method: "POST", body: fd })));
    expect(events.map((e: { stage: string }) => e.stage)).toEqual(expect.arrayContaining(["uploading", "processing", "detecting", "analyzing", "validating"]));
    expect(result.type).toBe("matrigma");
    expect(result.solution.answer).toBe(truth.correctAnswer);
    expect(result.imageStored).toBe(false);
  });

  it.skipIf(!hasPython())("analyze shows a clear error when no matrix is present", async () => {
    const sharp = (await import("sharp")).default;
    const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#fff" } }).png().toBuffer();
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(png)], "blank.png", { type: "image/png" }));
    fd.append("mode", "matrigma");
    const { result } = await readNdjson(await analyze(new Request("http://x", { method: "POST", body: fd })));
    expect(result.type).toBe("error");
    expect(result.message).toBe("Unable to reliably detect the matrix.");
    expect(result.problem).toBeTruthy();
  });

  it("clear all data", async () => {
    expect((await wipe(new Request("http://x?scope=all", { method: "DELETE" }))).status).toBe(200);
    expect((await wipe(new Request("http://x?scope=bogus", { method: "DELETE" }))).status).toBe(400);
  });
});
