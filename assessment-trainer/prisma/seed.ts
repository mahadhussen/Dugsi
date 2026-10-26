/** Seeds the MAP statement bank, categories and a starter set of generated questions. */
import { ensureSeeded, saveGenerated } from "../lib/database/repo";
import { prisma } from "../lib/database/client";
import { generateQuestion } from "../lib/matrigma/generator";
import { MATRIGMA_CATEGORIES } from "../lib/matrigma/types";

async function main() {
  await ensureSeeded();
  if ((await prisma.question.count({ where: { source: "generated" } })) === 0) {
    for (const category of MATRIGMA_CATEGORIES) for (let i = 0; i < 3; i++) await saveGenerated(generateQuestion({ category, seed: 1000 + i * 17 + category.length }));
  }
  console.log(`Seeded: ${await prisma.mAPStatement.count()} statements, ${await prisma.question.count()} questions`);
}

main().finally(() => prisma.$disconnect());
