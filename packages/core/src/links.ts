import { documentLinksTable, documentsTable } from "@lydie/database";
import { and, eq, inArray, not } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { convertJsonToYjs, convertYjsToJson } from "./yjs-to-json";

type Database = PostgresJsDatabase<any>;

export interface InternalLink {
  targetDocumentId: string;
  href: string;
}

export function extractInternalLinksFromJson(jsonContent: unknown): InternalLink[] {
  const links: InternalLink[] = [];
  const seenIds = new Set<string>();

  function traverse(node: unknown) {
    if (!node || typeof node !== "object") return;
    const nodeObj = node as Record<string, unknown>;

    if (nodeObj.type === "text" && Array.isArray(nodeObj.marks)) {
      for (const mark of nodeObj.marks) {
        if (!mark || typeof mark !== "object") continue;
        const markObj = mark as Record<string, unknown>;
        const attrs = markObj.attrs as Record<string, string> | undefined;
        if (!attrs) continue;

        if (markObj.type === "link" && attrs.kind === "internal" && attrs.refId) {
          const targetId = attrs.refId;
          if (!seenIds.has(targetId)) {
            seenIds.add(targetId);
            links.push({
              targetDocumentId: targetId,
              href: attrs.href || `/${targetId}`,
            });
          }
        }
      }
    }

    if (Array.isArray(nodeObj.content)) {
      for (const child of nodeObj.content) {
        traverse(child);
      }
    }
  }

  traverse(jsonContent);
  return links;
}

export async function indexDocumentLinks(
  documentId: string,
  yjsStateBase64: string | null | undefined,
  db: Database,
): Promise<void> {
  if (!yjsStateBase64) {
    await db.delete(documentLinksTable).where(eq(documentLinksTable.sourceDocumentId, documentId));
    return;
  }

  const jsonContent = convertYjsToJson(yjsStateBase64);
  const links = extractInternalLinksFromJson(jsonContent);
  const targetIds = links.map((link) => link.targetDocumentId);

  if (targetIds.length === 0) {
    await db.delete(documentLinksTable).where(eq(documentLinksTable.sourceDocumentId, documentId));
    return;
  }

  const targetDocs = await db
    .select({ id: documentsTable.id, slug: documentsTable.slug })
    .from(documentsTable)
    .where(inArray(documentsTable.id, targetIds));

  const slugMap = new Map<string, string>(
    targetDocs.map((d: { id: string; slug: string | null }) => [d.id, d.slug || d.id]),
  );

  await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    await tx.delete(documentLinksTable).where(eq(documentLinksTable.sourceDocumentId, documentId));

    if (links.length > 0) {
      const now = new Date();
      const values = links.map((link) => ({
        sourceDocumentId: documentId,
        targetDocumentId: link.targetDocumentId,
        lastVerifiedSlug: slugMap.get(link.targetDocumentId) || link.targetDocumentId,
        createdAt: now,
        updatedAt: now,
      }));

      await tx.insert(documentLinksTable).values(values);
    }
  });
}

export async function getBacklinks(targetDocumentId: string, db: Database): Promise<string[]> {
  const links = await db
    .select({ sourceDocumentId: documentLinksTable.sourceDocumentId })
    .from(documentLinksTable)
    .where(eq(documentLinksTable.targetDocumentId, targetDocumentId));

  return links.map((l: { sourceDocumentId: string }) => l.sourceDocumentId);
}

export async function getBacklinkDetails(
  targetDocumentId: string,
  db: Database,
): Promise<Array<{ id: string; title: string | null; slug: string | null }>> {
  const result = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      slug: documentsTable.slug,
    })
    .from(documentLinksTable)
    .innerJoin(documentsTable, eq(documentLinksTable.sourceDocumentId, documentsTable.id))
    .where(eq(documentLinksTable.targetDocumentId, targetDocumentId));

  return result;
}

export async function updateLinksForSlugChange(
  targetDocumentId: string,
  newSlug: string,
  yjsStateBase64: string,
): Promise<string | null> {
  const jsonContent = convertYjsToJson(yjsStateBase64);
  let hasChanges = false;

  function updateLinksInNode(node: unknown): unknown {
    if (!node || typeof node !== "object") return node;
    const nodeObj = node as Record<string, unknown>;

    if (nodeObj.type === "text" && Array.isArray(nodeObj.marks)) {
      const updatedMarks = nodeObj.marks.map((mark: unknown) => {
        if (!mark || typeof mark !== "object") return mark;
        const markObj = mark as Record<string, unknown>;
        const attrs = markObj.attrs as Record<string, string> | undefined;
        if (!attrs) return mark;

        if (
          markObj.type === "link" &&
          attrs.kind === "internal" &&
          attrs.refId === targetDocumentId
        ) {
          hasChanges = true;
          return {
            ...markObj,
            attrs: {
              ...attrs,
              href: `/${newSlug}`,
            },
          };
        }
        return mark;
      });

      return {
        ...nodeObj,
        marks: updatedMarks,
      };
    }

    if (Array.isArray(nodeObj.content)) {
      return {
        ...nodeObj,
        content: nodeObj.content.map(updateLinksInNode),
      };
    }

    return nodeObj;
  }

  const updatedContent = updateLinksInNode(jsonContent);

  if (!hasChanges) {
    return null;
  }

  return convertJsonToYjs(updatedContent);
}

export async function propagateSlugChange(
  targetDocumentId: string,
  newSlug: string,
  db: Database,
): Promise<{ updatedCount: number; errors: string[] }> {
  const errors: string[] = [];
  let updatedCount = 0;

  const backlinkSources = await db
    .select({
      sourceDocumentId: documentLinksTable.sourceDocumentId,
    })
    .from(documentLinksTable)
    .where(eq(documentLinksTable.targetDocumentId, targetDocumentId));

  for (const { sourceDocumentId } of backlinkSources) {
    try {
      const [doc] = await db
        .select({ yjsState: documentsTable.yjsState })
        .from(documentsTable)
        .where(eq(documentsTable.id, sourceDocumentId))
        .limit(1);

      if (!doc?.yjsState) continue;

      const updatedYjsState = await updateLinksForSlugChange(
        targetDocumentId,
        newSlug,
        doc.yjsState,
      );

      if (updatedYjsState) {
        await db
          .update(documentsTable)
          .set({
            yjsState: updatedYjsState,
            updatedAt: new Date(),
          })
          .where(eq(documentsTable.id, sourceDocumentId));

        await db
          .update(documentLinksTable)
          .set({
            lastVerifiedSlug: newSlug,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(documentLinksTable.sourceDocumentId, sourceDocumentId),
              eq(documentLinksTable.targetDocumentId, targetDocumentId),
            ),
          );

        updatedCount++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to update links in ${sourceDocumentId}: ${message}`);
    }
  }

  return { updatedCount, errors };
}

export async function validateInternalLinks(
  documentId: string,
  yjsStateBase64: string | null | undefined,
  db: Database,
): Promise<Array<{ targetDocumentId: string; exists: boolean }>> {
  if (!yjsStateBase64) {
    return [];
  }

  const jsonContent = convertYjsToJson(yjsStateBase64);
  const links = extractInternalLinksFromJson(jsonContent);

  if (links.length === 0) {
    return [];
  }

  const targetIds = links.map((l) => l.targetDocumentId);

  const existingDocs = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(and(inArray(documentsTable.id, targetIds), not(eq(documentsTable.id, documentId))));

  const existingIds = new Set(existingDocs.map((d: { id: string }) => d.id));

  return links.map((link) => ({
    targetDocumentId: link.targetDocumentId,
    exists: existingIds.has(link.targetDocumentId),
  }));
}

export async function hasIncomingLinks(documentId: string, db: Database): Promise<boolean> {
  const result = await db
    .select({ count: documentLinksTable.id })
    .from(documentLinksTable)
    .where(eq(documentLinksTable.targetDocumentId, documentId))
    .limit(1);

  return result.length > 0;
}

export async function getIncomingLinkCount(documentId: string, db: Database): Promise<number> {
  const result = await db
    .select({ count: documentLinksTable.id })
    .from(documentLinksTable)
    .where(eq(documentLinksTable.targetDocumentId, documentId));

  return result.length;
}
