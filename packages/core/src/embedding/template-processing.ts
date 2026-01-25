import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { templatesTable } from "@lydie/database/schema-only";
import { eq } from "drizzle-orm";

import { generateTitleEmbedding } from "./generation";

type Database = PostgresJsDatabase<any>;

export async function processTemplateTitleEmbedding(
  params: {
    templateId: string;
    title: string;
  },
  db: Database,
): Promise<void> {
  const { templateId, title } = params;

  try {
    const trimmedTitle = title.trim();
    const MIN_TITLE_LENGTH = 3;

    if (trimmedTitle.length < MIN_TITLE_LENGTH) {
      return;
    }

    const titleEmbedding = await generateTitleEmbedding(trimmedTitle);

    await db
      .update(templatesTable)
      .set({
        titleEmbedding: titleEmbedding,
        updatedAt: new Date(),
      })
      .where(eq(templatesTable.id, templateId));
  } catch (error) {
    console.error(`Failed to process title embedding for template ${templateId}:`, error);
    throw error;
  }
}
