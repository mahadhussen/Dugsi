import { getProviders } from "@/lib/ai";
import { prisma } from "@/lib/database/client";
import { body, error, json } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/** Analyse a statement typed by the user (or corrected after OCR). */
export async function POST(req: Request) {
  const { text } = await body<{ text?: string }>(req);
  const statement = (text ?? "").trim();
  if (statement.split(/\s+/).length < 3) return error("Please enter a full statement (at least three words).");
  const analysis = await getProviders().text.analyzeStatement(statement);
  const row = await prisma.mAPStatement.create({
    data: { text: statement, domain: analysis.category, subscale: analysis.subscale, keyed: analysis.keyed, source: "manual", interpretation: analysis.interpretation, behaviour: analysis.behaviour },
  });
  return json({ statementId: row.id, analysis });
}
