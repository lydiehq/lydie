import type { Zero } from "@rocicorp/zero";
import { mutators } from "@lydie/zero/mutators";
import { createId } from "@lydie/core/id";
import { zql } from "@lydie/zero/schema";

export type TrialDocument = {
  id: string;
  title: string;
  slug: string;
  json_content: any;
  folder_id: string | null;
  created_at: number;
  updated_at: number;
};

export type TrialFolder = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
  updated_at: number;
};

export type TrialData = {
  documents: TrialDocument[];
  folders: TrialFolder[];
};

/**
 * Reads all documents and folders from a trial Zero instance
 */
export async function getTrialData(trialZero: Zero): Promise<TrialData> {
  try {
    // Query all documents (no organization filter in trial mode)
    const documents = await trialZero.query(
      zql.documents
        .where("deleted_at", "IS", null)
        .orderBy("created_at", "asc")
    );

    // Query all folders (no organization filter in trial mode)
    const folders = await trialZero.query(
      zql.folders
        .where("deleted_at", "IS", null)
        .orderBy("created_at", "asc")
    );

    return {
      documents: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        slug: doc.slug,
        json_content: doc.json_content,
        folder_id: doc.folder_id,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
      })),
      folders: folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parent_id: folder.parent_id,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
      })),
    };
  } catch (error) {
    console.error("Failed to read trial data:", error);
    throw new Error("Failed to read trial data");
  }
}

/**
 * Transfers trial data to an authenticated Zero instance
 * Creates new documents and folders with new IDs in the target organization
 */
export async function transferTrialData(
  trialData: TrialData,
  authZero: Zero,
  targetOrgId: string
): Promise<void> {
  try {
    // Create a mapping from old folder IDs to new folder IDs
    const folderIdMap = new Map<string, string>();

    // First, transfer folders (in order, parents before children)
    // We need to sort folders to ensure parents are created before children
    const sortedFolders = sortFoldersByHierarchy(trialData.folders);

    for (const folder of sortedFolders) {
      const newFolderId = createId();
      folderIdMap.set(folder.id, newFolderId);

      const newParentId = folder.parent_id
        ? folderIdMap.get(folder.parent_id) || null
        : null;

      await authZero.mutate(
        mutators.folder.create({
          id: newFolderId,
          name: folder.name,
          organizationId: targetOrgId,
          parentId: newParentId || undefined,
        })
      );
    }

    // Then, transfer documents
    for (const doc of trialData.documents) {
      const newDocId = createId();
      const newFolderId = doc.folder_id
        ? folderIdMap.get(doc.folder_id) || undefined
        : undefined;

      await authZero.mutate(
        mutators.document.create({
          id: newDocId,
          organizationId: targetOrgId,
          title: doc.title,
          folderId: newFolderId,
          jsonContent: doc.json_content,
        })
      );
    }
  } catch (error) {
    console.error("Failed to transfer trial data:", error);
    throw new Error("Failed to transfer trial data. Please try again.");
  }
}

/**
 * Clears all trial data from a Zero instance
 * Should be called after successful transfer to clean up
 */
export async function clearTrialData(trialZero: Zero): Promise<void> {
  try {
    // Get all documents and folders
    const documents = await trialZero.query(
      zql.documents.where("deleted_at", "IS", null)
    );
    const folders = await trialZero.query(
      zql.folders.where("deleted_at", "IS", null)
    );

    // Delete all documents
    for (const doc of documents) {
      await trialZero.mutate(
        mutators.document.delete({
          documentId: doc.id,
          organizationId: "", // Not checked in trial mode
        })
      );
    }

    // Delete all folders
    for (const folder of folders) {
      await trialZero.mutate(
        mutators.folder.delete({
          folderId: folder.id,
          organizationId: "", // Not checked in trial mode
        })
      );
    }

    // Clear the trial user ID from localStorage
    localStorage.removeItem("lydie:trial-user-id");
  } catch (error) {
    console.error("Failed to clear trial data:", error);
    // Don't throw - clearing is not critical
  }
}

/**
 * Sorts folders by hierarchy so parents come before children
 */
function sortFoldersByHierarchy(folders: TrialFolder[]): TrialFolder[] {
  const sorted: TrialFolder[] = [];
  const remaining = [...folders];
  const processedIds = new Set<string>();

  // Keep processing until all folders are sorted
  while (remaining.length > 0) {
    const initialLength = remaining.length;

    for (let i = remaining.length - 1; i >= 0; i--) {
      const folder = remaining[i];

      // If folder has no parent or parent is already processed, add it
      if (!folder.parent_id || processedIds.has(folder.parent_id)) {
        sorted.push(folder);
        processedIds.add(folder.id);
        remaining.splice(i, 1);
      }
    }

    // If we didn't process any folders in this iteration, we have a circular reference
    // or invalid hierarchy - just add remaining folders
    if (remaining.length === initialLength && remaining.length > 0) {
      console.warn(
        "Circular or invalid folder hierarchy detected, adding remaining folders"
      );
      sorted.push(...remaining);
      break;
    }
  }

  return sorted;
}

/**
 * Checks if there is any trial data to transfer
 */
export async function hasTrialData(trialZero: Zero): Promise<boolean> {
  try {
    const documents = await trialZero.query(
      zql.documents.where("deleted_at", "IS", null).limit(1)
    );

    return documents.length > 0;
  } catch (error) {
    console.error("Failed to check for trial data:", error);
    return false;
  }
}

