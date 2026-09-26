import fs from "node:fs";
import path from "node:path";
import { prisma } from "./client";
import type { GeneratedMatrixQuestion, MatrixProblem } from "../matrigma/types";
import { CATEGORY_LABELS, MATRIGMA_CATEGORIES } from "../matrigma/types";
import { GENERATOR_VERSION } from "../matrigma/generator";
import { solveMatrix } from "../solver/solve";
import { STATEMENT_BANK } from "../map/statements";
import { SUBSCALES, DOMAINS } from "../map/model";
import { describe } from "../map/classify";
import { computeStats, type AttemptLike } from "../statistics/stats";
import { calibrationTable } from "../statistics/calibration";
import type { CalibrationBin } from "../solver/confidence";

export interface Settings {
  storeImages: boolean;
  perQuestionSeconds: number;
  defaultSessionSize: 5 | 10 | 20;
}

export const DEFAULT_SETTINGS: Settings = { storeImages: false, perQuestionSeconds: 60, defaultSessionSize: 10 };

export async function getUser() {
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  return existing ?? prisma.user.create({ data: {} });
}

export async function getSettings(): Promise<Settings> {
  const u = await getUser();
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(u.settings) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const u = await getUser();
  const next = { ...(await getSettings()), ...patch };
  await prisma.user.update({ where: { id: u.id }, data: { settings: JSON.stringify(next) } });
  return next;
}

async function categoryId(key: string, kind: "matrigma" | "map") {
  const name = (CATEGORY_LABELS as Record<string, string>)[key] ?? key;
  const c = await prisma.questionCategory.upsert({ where: { key }, update: {}, create: { key, name, kind } });
  return c.id;
}

export async function ensureSeeded() {
  const n = await prisma.mAPStatement.count({ where: { source: "bank" } });
  if (n === 0) {
    for (const s of STATEMENT_BANK) {
      const sub = SUBSCALES.find((x) => x.key === s.subscale)!;
      const a = describe(s.text, sub, s.keyed, 1, "bank");
      await prisma.mAPStatement.create({
        data: { id: s.id, text: s.text, lang: "sv", domain: sub.domain, subscale: s.subscale, keyed: s.keyed, source: "bank", interpretation: a.interpretation, behaviour: a.behaviour },
      });
    }
  }
  for (const c of MATRIGMA_CATEGORIES) await categoryId(c, "matrigma");
  for (const d of DOMAINS) await categoryId(`map:${d.key}`, "map");
}

/** Cached calibration from all solver predictions with a known correct answer. */
export async function getCalibration(): Promise<CalibrationBin[]> {
  const qs = await prisma.question.findMany({
    where: { type: "matrigma", solverConfidence: { not: null }, correctAnswer: { not: null } },
    select: { solverAnswer: true, solverConfidence: true, correctAnswer: true, source: true, verified: true },
  });
  const pts = qs
    .filter((q) => q.source === "generated" || q.verified)
    .map((q) => ({ confidence: q.solverConfidence!, correct: q.solverAnswer === q.correctAnswer }));
  return calibrationTable(pts);
}

export async function saveGenerated(q: GeneratedMatrixQuestion) {
  const s = solveMatrix(q.problem);
  const row = await prisma.question.create({
    data: {
      type: "matrigma",
      source: "generated",
      categoryId: await categoryId(q.category, "matrigma"),
      difficulty: q.difficulty,
      rule: q.ruleText,
      payload: JSON.stringify(q.problem),
      correctAnswer: q.correctAnswer,
      solverAnswer: s.answer,
      solverConfidence: s.confidence,
      solverStrategy: s.strategy,
      generated: {
        create: { seed: q.seed, generatorVersion: GENERATOR_VERSION, category: q.category, difficulty: q.difficulty, rules: JSON.stringify(q.rules) },
      },
    },
  });
  return { id: row.id, solution: s };
}

export async function saveScreenshotQuestion(opts: {
  problem: MatrixProblem;
  solverAnswer: number | null;
  confidence: number;
  strategy: string | null;
  rule: string;
  image?: { buffer: Buffer; ext: string } | null;
}) {
  const settings = await getSettings();
  let imagePath: string | null = null;
  const row = await prisma.question.create({
    data: {
      type: "matrigma",
      source: "screenshot",
      difficulty: "unknown",
      rule: opts.rule,
      payload: JSON.stringify(opts.problem),
      solverAnswer: opts.solverAnswer,
      solverConfidence: opts.confidence,
      solverStrategy: opts.strategy,
    },
  });
  if (settings.storeImages && opts.image) {
    const dir = process.env.UPLOAD_DIR ?? "./data/uploads";
    fs.mkdirSync(dir, { recursive: true });
    imagePath = path.join(dir, `${row.id}.${opts.image.ext}`);
    fs.writeFileSync(imagePath, opts.image.buffer);
    await prisma.question.update({ where: { id: row.id }, data: { imagePath } });
  }
  return { id: row.id, imageStored: !!imagePath };
}

export async function deleteImage(questionId: string) {
  const q = await prisma.question.findUnique({ where: { id: questionId } });
  if (!q) return false;
  if (q.imagePath && fs.existsSync(q.imagePath)) fs.unlinkSync(q.imagePath);
  await prisma.question.update({ where: { id: questionId }, data: { imagePath: null } });
  return true;
}

export async function deleteAllImages() {
  const qs = await prisma.question.findMany({ where: { imagePath: { not: null } } });
  for (const q of qs) if (q.imagePath && fs.existsSync(q.imagePath)) fs.unlinkSync(q.imagePath);
  await prisma.question.updateMany({ where: { imagePath: { not: null } }, data: { imagePath: null } });
  return qs.length;
}

export async function deleteHistory() {
  const u = await getUser();
  await prisma.questionAttempt.deleteMany({ where: { userId: u.id } });
  await prisma.mAPResponse.deleteMany({ where: { userId: u.id } });
  await prisma.practiceSession.deleteMany({ where: { userId: u.id } });
  await prisma.performanceMetric.deleteMany({ where: { userId: u.id } });
}

export async function clearAllData() {
  await deleteAllImages();
  await prisma.questionAttempt.deleteMany();
  await prisma.mAPResponse.deleteMany();
  await prisma.practiceSession.deleteMany();
  await prisma.performanceMetric.deleteMany();
  await prisma.generatedQuestion.deleteMany();
  await prisma.question.deleteMany();
  await prisma.mAPStatement.deleteMany({ where: { source: { not: "bank" } } });
  await prisma.user.deleteMany();
}

export async function recordAttempt(a: {
  questionId: string;
  sessionId?: string | null;
  selectedAnswer: number | null;
  responseTime: number;
}) {
  const u = await getUser();
  const q = await prisma.question.findUniqueOrThrow({ where: { id: a.questionId }, include: { category: true } });
  if (q.correctAnswer === null) throw new Error("Question has no known correct answer");
  const isCorrect = a.selectedAnswer === q.correctAnswer;
  const category = q.category?.key ?? "unknown";
  const attempt = await prisma.questionAttempt.create({
    data: {
      userId: u.id,
      questionId: q.id,
      sessionId: a.sessionId ?? null,
      selectedAnswer: a.selectedAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect,
      responseTime: Math.max(0, Math.round(a.responseTime)),
      difficulty: q.difficulty,
      category,
      confidence: q.solverConfidence,
      solverStrategy: q.solverStrategy,
    },
  });
  const day = new Date().toISOString().slice(0, 10);
  await prisma.performanceMetric.upsert({
    where: { userId_day_category: { userId: u.id, day, category } },
    update: { attempts: { increment: 1 }, correct: { increment: isCorrect ? 1 : 0 }, totalTimeMs: { increment: attempt.responseTime } },
    create: { userId: u.id, day, category, attempts: 1, correct: isCorrect ? 1 : 0, totalTimeMs: attempt.responseTime },
  });
  return { attempt, isCorrect, correctAnswer: q.correctAnswer };
}

export async function getAttempts(limit?: number): Promise<(AttemptLike & { id: string; questionId: string; selectedAnswer: number | null; correctAnswer: number })[]> {
  const u = await getUser();
  return prisma.questionAttempt.findMany({ where: { userId: u.id }, orderBy: { timestamp: "desc" }, take: limit });
}

export async function getStats() {
  const attempts = await getAttempts();
  const stats = computeStats(attempts);
  const u = await getUser();
  const mapResponses = await prisma.mAPResponse.count({ where: { userId: u.id } });
  const mapAnsweredStatements = await prisma.mAPResponse.groupBy({ by: ["statementId"], where: { userId: u.id } });
  const bankSize = await prisma.mAPStatement.count({ where: { source: "bank" } });
  return {
    ...stats,
    solverCalibration: await getCalibration(),
    map: { responses: mapResponses, distinctStatements: mapAnsweredStatements.length, bankSize, completion: bankSize ? mapAnsweredStatements.length / bankSize : 0 },
    recent: attempts.slice(0, 10),
  };
}
