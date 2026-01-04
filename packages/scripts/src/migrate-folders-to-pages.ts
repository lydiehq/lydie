import { db } from "@lydie/database";
import { documentsTable } from "@lydie/database";
import { eq, sql } from "drizzle-orm";
import { createId } from "@lydie/core/id";
import { convertJsonToYjs } from "@lydie/core/yjs-to-json";

/**
 * Migration script to convert folder-based structure to page-hierarchy
 *
 * This script:
 * 1. Creates a document for each folder
 * 2. Preserves hierarchy by setting parent_id relationships
 * 3. Moves documents from folders to be children of folder-documents
 * 4. Handles nested folders recursively
 */
async function migrateFoldersToPages() {
  console.log("🔄 Starting folder-to-pages migration...");

  try {
    // Get all non-deleted folders using raw SQL (since foldersTable was removed from schema)
    // Check if folders table exists first
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'folders'
      )
    `);

    const exists = (tableExists[0] as { exists: boolean }).exists;
    if (!exists) {
      console.log("✅ Folders table does not exist. Migration not needed.");
      return;
    }

    const allFolders = (await db.execute(sql`
      SELECT id, name, parent_id, user_id, organization_id, 
             integration_link_id, created_at, updated_at
      FROM folders
      WHERE deleted_at IS NULL
    `)) as Array<{
      id: string;
      name: string;
      parent_id: string | null;
      user_id: string | null;
      organization_id: string;
      integration_link_id: string | null;
      created_at: Date;
      updated_at: Date;
    }>;

    if (allFolders.length === 0) {
      console.log("✅ No folders found. Migration not needed.");
      return;
    }

    console.log(`📁 Found ${allFolders.length} folders to migrate`);

    // Map: folderId -> documentId (for the folder-document we create)
    const folderToDocumentMap = new Map<string, string>();

    // Step 1: Create documents for all folders (in order of hierarchy depth)
    // Sort folders by depth (root folders first, then children)
    const sortedFolders = sortFoldersByDepth(allFolders);

    for (const folder of sortedFolders) {
      const folderDocumentId = createId();
      folderToDocumentMap.set(folder.id, folderDocumentId);

      // Determine parent document ID
      // If folder has a parent, use the parent folder's document ID
      let parentDocumentId: string | null = null;
      if (folder.parent_id) {
        parentDocumentId = folderToDocumentMap.get(folder.parent_id) || null;
        if (!parentDocumentId) {
          console.warn(
            `⚠️  Folder ${folder.id} has parent ${folder.parent_id} but parent document not found. Skipping parent relationship.`
          );
        }
      }

      // Create document for this folder
      const emptyContent = { type: "doc", content: [] };
      const yjsState = convertJsonToYjs(emptyContent);
      await db.insert(documentsTable).values({
        id: folderDocumentId,
        title: folder.name,
        slug: folderDocumentId, // Use document ID as slug for uniqueness
        yjsState: yjsState,
        userId: folder.user_id,
        organizationId: folder.organization_id,
        parentId: parentDocumentId,
        integrationLinkId: folder.integration_link_id,
        indexStatus: "pending",
        published: false,
        createdAt: folder.created_at,
        updatedAt: folder.updated_at,
      });

      console.log(
        `✅ Created document ${folderDocumentId} for folder "${folder.name}" (${folder.id})`
      );
    }

    // Step 2: Update documents that were in folders to be children of folder-documents
    // Get all documents that have a folder_id (using raw SQL since column was removed from schema)
    const documentsInFolders = (await db.execute(sql`
      SELECT id, title, folder_id
      FROM documents
      WHERE folder_id IS NOT NULL
        AND deleted_at IS NULL
    `)) as Array<{
      id: string;
      title: string | null;
      folder_id: string;
    }>;

    console.log(
      `📄 Found ${documentsInFolders.length} documents in folders to migrate`
    );

    for (const doc of documentsInFolders) {
      if (!doc.folder_id) continue;

      const folderDocumentId = folderToDocumentMap.get(doc.folder_id);
      if (!folderDocumentId) {
        console.warn(
          `⚠️  Document ${doc.id} references folder ${doc.folder_id} but folder document not found. Skipping.`
        );
        continue;
      }

      // Update document to be a child of the folder-document
      // If document already has a parent_id, we need to decide:
      // Option 1: Keep existing parent_id (if it's a document parent)
      // Option 2: Set parent_id to folder-document
      // We'll set it to the folder-document, which makes the folder-document the parent
      await db
        .update(documentsTable)
        .set({
          parentId: folderDocumentId,
          updatedAt: new Date(),
        })
        .where(eq(documentsTable.id, doc.id));

      console.log(
        `✅ Moved document "${doc.title || "Untitled"}" (${
          doc.id
        }) to be child of folder-document ${folderDocumentId}`
      );
    }

    console.log("✅ Migration completed successfully!");
    console.log(
      `📊 Summary: Created ${folderToDocumentMap.size} folder-documents and migrated ${documentsInFolders.length} documents`
    );
    console.log(
      "⚠️  Note: The folders table still exists in the database. You can drop it manually after verifying the migration."
    );
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

/**
 * Sort folders by hierarchy depth (root folders first, then children)
 * This ensures parent folder-documents are created before child folder-documents
 */
function sortFoldersByDepth(
  folders: Array<{ id: string; parent_id: string | null; [key: string]: any }>
): Array<{ id: string; parent_id: string | null; [key: string]: any }> {
  const folderMap = new Map(folders.map((f) => [f.id, f]));
  const depthMap = new Map<string, number>();

  function getDepth(folderId: string): number {
    if (depthMap.has(folderId)) {
      return depthMap.get(folderId)!;
    }

    const folder = folderMap.get(folderId);
    if (!folder || !folder.parent_id) {
      depthMap.set(folderId, 0);
      return 0;
    }

    const depth = getDepth(folder.parent_id) + 1;
    depthMap.set(folderId, depth);
    return depth;
  }

  // Calculate depth for all folders
  folders.forEach((folder) => getDepth(folder.id));

  // Sort by depth
  return [...folders].sort((a, b) => {
    const depthA = depthMap.get(a.id) || 0;
    const depthB = depthMap.get(b.id) || 0;
    return depthA - depthB;
  });
}

// Run migration if called directly
if (import.meta.main) {
  migrateFoldersToPages()
    .then(() => {
      console.log("✅ Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Migration script failed:", error);
      process.exit(1);
    });
}

export { migrateFoldersToPages };
