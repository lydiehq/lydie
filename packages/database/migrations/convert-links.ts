// Migration script to convert legacy internal:// links to new format
// Run with: bun run packages/database/migrations/convert-links.ts

import { db } from "@lydie/database";
import { documentsTable } from "@lydie/database/schema";
import { eq, isNotNull } from "drizzle-orm";
import { convertJsonToYjs, convertYjsToJson } from "@lydie/core/yjs-to-json";

interface InternalLink {
  targetDocumentId: string;
  href: string;
}

function extractLegacyLinksFromJson(jsonContent: unknown): InternalLink[] {
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

        // Legacy format: href="internal://{documentId}"
        if (markObj.type === "link" && attrs.href?.startsWith("internal://")) {
          const targetId = attrs.href.replace("internal://", "");
          if (targetId && !seenIds.has(targetId)) {
            seenIds.add(targetId);
            links.push({
              targetDocumentId: targetId,
              href: `/${targetId}`,
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

function convertLegacyLinksInJson(jsonContent: unknown): unknown {
  function traverse(node: unknown): unknown {
    if (!node || typeof node !== "object") return node;
    const nodeObj = node as Record<string, unknown>;

    if (nodeObj.type === "text" && Array.isArray(nodeObj.marks)) {
      const updatedMarks = nodeObj.marks.map((mark: unknown) => {
        if (!mark || typeof mark !== "object") return mark;
        const markObj = mark as Record<string, unknown>;
        const attrs = markObj.attrs as Record<string, string> | undefined;
        if (!attrs) return mark;

        // Convert legacy format to new format
        if (markObj.type === "link" && attrs.href?.startsWith("internal://")) {
          const targetId = attrs.href.replace("internal://", "");
          return {
            ...markObj,
            attrs: {
              kind: "internal",
              refId: targetId,
              href: `/${targetId}`,
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
        content: nodeObj.content.map(traverse),
      };
    }

    return nodeObj;
  }

  return traverse(jsonContent);
}

async function migrateLinks() {
  console.log("Starting link migration...");

  const documents = await db
    .select({ id: documentsTable.id, yjsState: documentsTable.yjsState })
    .from(documentsTable)
    .where(isNotNull(documentsTable.yjsState));

  console.log(`Found ${documents.length} documents to check`);

  let migratedCount = 0;
  let linkCount = 0;

  for (const doc of documents) {
    if (!doc.yjsState) continue;

    const jsonContent = convertYjsToJson(doc.yjsState);
    const legacyLinks = extractLegacyLinksFromJson(jsonContent);

    if (legacyLinks.length === 0) continue;

    console.log(`Document ${doc.id}: Found ${legacyLinks.length} legacy links`);

    const updatedContent = convertLegacyLinksInJson(jsonContent);
    const updatedYjsState = convertJsonToYjs(updatedContent);

    if (updatedYjsState) {
      await db
        .update(documentsTable)
        .set({ yjsState: updatedYjsState })
        .where(eq(documentsTable.id, doc.id));

      migratedCount++;
      linkCount += legacyLinks.length;
    }
  }

  console.log(`\nMigration complete!`);
  console.log(`Migrated ${migratedCount} documents with ${linkCount} total links`);
}

migrateLinks()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
