import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/database/client";
import { clearAllData, deleteHistory, ensureSeeded, getSettings, getStats, recordAttempt, saveGenerated, updateSettings, saveScreenshotQuestion, deleteImage } from "@/lib/database/repo";
import { generateQuestion } from "@/lib/matrigma/generator";
import { MATRIGMA_CATEGORIES } from "@/lib/matrigma/types";
import fs from "node:fs";

describe("database", () => {
  beforeAll(async () => {
    await clearAllData();
    await ensureSeeded();
  });

  it("seeds the MAP statement bank and categories", async () => {
    expect(await prisma.mAPStatement.count({ where: { source: "bank" } })).toBe(75);
    expect(await prisma.questionCategory.count({ where: { kind: "matrigma" } })).toBe(MATRIGMA_CATEGORIES.length);
  });

  it("stores generated questions with solver verdict and records attempts", async () => {
    const q = generateQuestion({ category: "fill", seed: 5 });
    const { id } = await saveGenerated(q);
    const row = await prisma.question.findUniqueOrThrow({ where: { id }, include: { generated: true } });
    expect(row.correctAnswer).toBe(q.correctAnswer);
    expect(row.solverAnswer).toBe(q.correctAnswer);
    expect(row.generated?.seed).toBe(5);
    const r = await recordAttempt({ questionId: id, selectedAnswer: q.correctAnswer, responseTime: 4200 });
    expect(r.isCorrect).toBe(true);
    expect(r.attempt).toMatchObject({ category: "fill", difficulty: q.difficulty, correctAnswer: q.correctAnswer, responseTime: 4200 });
    expect(r.attempt.confidence).toBeGreaterThan(0.5);
    const metric = await prisma.performanceMetric.findFirstOrThrow({ where: { category: "fill" } });
    expect(metric.attempts).toBe(1);
    const stats = await getStats();
    expect(stats.total).toBe(1);
    expect(stats.solverCalibration.some((b) => b.n > 0)).toBe(true);
  });

  it("does not store images unless enabled, and can delete them", async () => {
    const q = generateQuestion({ seed: 11 });
    const img = { buffer: Buffer.from("fake"), ext: "png" };
    const a = await saveScreenshotQuestion({ problem: q.problem, solverAnswer: 1, confidence: 0.5, strategy: null, rule: "", image: img });
    expect(a.imageStored).toBe(false);
    await updateSettings({ storeImages: true });
    expect((await getSettings()).storeImages).toBe(true);
    const b = await saveScreenshotQuestion({ problem: q.problem, solverAnswer: 1, confidence: 0.5, strategy: null, rule: "", image: img });
    expect(b.imageStored).toBe(true);
    const row = await prisma.question.findUniqueOrThrow({ where: { id: b.id } });
    expect(fs.existsSync(row.imagePath!)).toBe(true);
    await deleteImage(b.id);
    expect(fs.existsSync(row.imagePath!)).toBe(false);
    await updateSettings({ storeImages: false });
  });

  it("delete history and clear all data", async () => {
    await deleteHistory();
    expect(await prisma.questionAttempt.count()).toBe(0);
    expect(await prisma.question.count()).toBeGreaterThan(0);
    await clearAllData();
    expect(await prisma.question.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
  });
});
