import { documentTitleEmbeddingsTable, documentsTable } from "@lydie/database/schema-only"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { generateTitleEmbedding } from "./generation"

type Database = PostgresJsDatabase<any>

export async function processDocumentTitleEmbedding(
	params: {
		documentId: string
		title: string
	},
	db: Database,
): Promise<void> {
	const { documentId, title } = params

	try {
		const trimmedTitle = title.trim()
		const MIN_TITLE_LENGTH = 3

		const existingDoc = await db
			.select({ lastIndexedTitle: documentsTable.lastIndexedTitle })
			.from(documentsTable)
			.where(eq(documentsTable.id, documentId))
			.limit(1)

		if (existingDoc[0]?.lastIndexedTitle === trimmedTitle) {
			return
		}

		await db.transaction(async (tx) => {
			await tx
				.delete(documentTitleEmbeddingsTable)
				.where(eq(documentTitleEmbeddingsTable.documentId, documentId))

			if (trimmedTitle.length >= MIN_TITLE_LENGTH) {
				const titleEmbedding = await generateTitleEmbedding(trimmedTitle)

				await tx.insert(documentTitleEmbeddingsTable).values({
					documentId: documentId,
					title: trimmedTitle,
					embedding: titleEmbedding,
				})
			}

			await tx
				.update(documentsTable)
				.set({
					lastIndexedTitle: trimmedTitle,
					updatedAt: new Date(),
				})
				.where(eq(documentsTable.id, documentId))
		})
	} catch (error) {
		console.error(`Failed to process title embedding for document ${documentId}:`, error)
		throw error
	}
}
