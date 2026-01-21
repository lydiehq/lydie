import { documentsTable, documentEmbeddingsTable } from "@lydie/database/schema-only"
import { eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { generateContentHash } from "../hash"
import { serializeToPlainText } from "../serialization/text"
import { generateParagraphChunks, generateSimpleChunks, type ParagraphChunk } from "./chunking"
import { generateManyEmbeddings } from "./generation"
import { convertYjsToJson } from "../yjs-to-json"
import {
  extractSections,
  sectionsToHashMap,
  findChangedSections,
  sectionToJsonDoc,
  type SectionHashes,
} from "./section-hashing"

type Database = PostgresJsDatabase<any>

async function processDocumentWithoutSections(
  documentId: string,
  jsonContent: any,
  plaintextContent: string,
  db: Database,
): Promise<void> {
  await db
    .transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
      await tx
        .update(documentsTable)
        .set({ indexStatus: "indexing", updatedAt: new Date() })
        .where(eq(documentsTable.id, documentId))

      await tx.delete(documentEmbeddingsTable).where(eq(documentEmbeddingsTable.documentId, documentId))

      let chunks: ParagraphChunk[] | ReturnType<typeof generateSimpleChunks>
      try {
        chunks = generateParagraphChunks(jsonContent)
      } catch (error) {
        console.warn(
          `Failed to generate paragraph chunks for document ${documentId}, falling back to simple chunking`,
          error,
        )
        chunks = generateSimpleChunks(plaintextContent)
      }

      if (chunks.length > 0) {
        const chunkTexts = chunks.map((c) => c.content)
        const embeddings = await generateManyEmbeddings(chunkTexts)

        await tx.insert(documentEmbeddingsTable).values(
          chunks.map((chunk, i) => ({
            content: chunk.content,
            embedding: embeddings[i]!,
            documentId: documentId,
            chunkIndex: chunk.index,
            heading:
              "headerPath" in chunk ? chunk.headerPath[chunk.headerPath.length - 1] : (chunk as any).heading,
            headingLevel:
              "headerLevels" in chunk
                ? chunk.headerLevels[chunk.headerLevels.length - 1]
                : (chunk as any).level,
            headerBreadcrumb: "headerBreadcrumb" in chunk ? chunk.headerBreadcrumb : null,
          })),
        )
      }

      await tx
        .update(documentsTable)
        .set({
          indexStatus: "indexed",
          updatedAt: new Date(),
        })
        .where(eq(documentsTable.id, documentId))
    })
    .catch(async (error: unknown) => {
      // If transaction fails, mark document as failed outside transaction
      await db
        .update(documentsTable)
        .set({ indexStatus: "failed", updatedAt: new Date() })
        .where(eq(documentsTable.id, documentId))

      throw error
    })
}

export async function processDocumentEmbedding(
  params: {
    documentId: string
    yjsState: string | null // base64 encoded
  },
  db: Database,
): Promise<{ skipped: boolean; reason?: string }> {
  const { documentId, yjsState } = params

  // convertYjsToJson handles empty yjsState by returning an empty document
  const jsonContent = convertYjsToJson(yjsState)

  const sections = extractSections(jsonContent)

  if (sections.length === 0) {
    console.warn(`Document ${documentId}: No sections extracted, falling back to full document chunking`)

    const plaintextContent = serializeToPlainText(jsonContent as any)
    const currentContentHash = generateContentHash(plaintextContent)

    const existingDoc = await db
      .select({
        lastIndexedContentHash: documentsTable.lastIndexedContentHash,
      })
      .from(documentsTable)
      .where(eq(documentsTable.id, documentId))
      .limit(1)

    const hasContentChanged =
      !existingDoc[0]?.lastIndexedContentHash || existingDoc[0].lastIndexedContentHash !== currentContentHash

    if (!hasContentChanged) {
      return { skipped: true, reason: "content_unchanged" }
    }

    await processDocumentWithoutSections(documentId, jsonContent, plaintextContent, db)
    return { skipped: false }
  }

  const newSectionHashes = sectionsToHashMap(sections)

  const existingDoc = await db
    .select({
      sectionHashes: (documentsTable as any).sectionHashes,
    })
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId))
    .limit(1)

  const oldSectionHashes = existingDoc[0]?.sectionHashes as SectionHashes | null

  const { changedSections, unchangedSectionKeys, isFullReindex } = findChangedSections(
    oldSectionHashes,
    sections,
  )

  if (changedSections.length === 0 && !isFullReindex) {
    return { skipped: true, reason: "content_unchanged" }
  }

  await db
    .transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
      await tx
        .update(documentsTable)
        .set({ indexStatus: "indexing", updatedAt: new Date() })
        .where(eq(documentsTable.id, documentId))

      if (isFullReindex) {
        await tx.delete(documentEmbeddingsTable).where(eq(documentEmbeddingsTable.documentId, documentId))
      } else {
        await tx.delete(documentEmbeddingsTable).where(eq(documentEmbeddingsTable.documentId, documentId))
      }

      let allChunks: ParagraphChunk[] | ReturnType<typeof generateSimpleChunks> = []

      try {
        allChunks = generateParagraphChunks(jsonContent)
      } catch (error) {
        console.warn(
          `Failed to generate paragraph chunks for document ${documentId}, falling back to simple chunking`,
          error,
        )
        const plaintextContent = serializeToPlainText(jsonContent)
        allChunks = generateSimpleChunks(plaintextContent)
      }

      if (allChunks.length > 0) {
        const chunkTexts = allChunks.map((c) => c.content)
        const embeddings = await generateManyEmbeddings(chunkTexts)

        await tx.insert(documentEmbeddingsTable).values(
          allChunks.map((chunk, i) => ({
            content: chunk.content,
            embedding: embeddings[i]!,
            documentId: documentId,
            chunkIndex: chunk.index,
            heading:
              "headerPath" in chunk ? chunk.headerPath[chunk.headerPath.length - 1] : (chunk as any).heading,
            headingLevel:
              "headerLevels" in chunk
                ? chunk.headerLevels[chunk.headerLevels.length - 1]
                : (chunk as any).level,
            headerBreadcrumb: "headerBreadcrumb" in chunk ? chunk.headerBreadcrumb : null,
          })),
        )
      }

      await tx
        .update(documentsTable)
        .set({
          indexStatus: "indexed",
          sectionHashes: newSectionHashes,
          updatedAt: new Date(),
        } as any)
        .where(eq(documentsTable.id, documentId))
    })
    .catch(async (error: unknown) => {
      // If transaction fails, mark document as failed outside transaction
      await db
        .update(documentsTable)
        .set({ indexStatus: "failed", updatedAt: new Date() })
        .where(eq(documentsTable.id, documentId))

      throw error
    })

  return { skipped: false }
}
