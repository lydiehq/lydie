/**
 * Utility functions for transforming database field names to API response format
 */

/**
 * Converts snake_case string to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Transforms an object's keys from snake_case to camelCase
 */
export function transformToCamelCase<T extends Record<string, any>>(
  obj: T
): any {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => transformToCamelCase(item));
  }

  const transformed: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    transformed[camelKey] = value;
  }

  return transformed;
}

/**
 * Transforms a document object from database format to API format
 */
export function transformDocument(document: any): any {
  if (!document) return null;

  return {
    id: document.id,
    title: document.title,
    slug: document.slug,
    jsonContent: document.json_content || document.jsonContent,
    userId: document.user_id || document.userId,
    folderId: document.folder_id || document.folderId,
    organizationId: document.organization_id || document.organizationId,
    indexStatus: document.index_status || document.indexStatus,
    published: document.published,
    lastIndexedTitle: document.last_indexed_title || document.lastIndexedTitle,
    lastIndexedContentHash:
      document.last_indexed_content_hash || document.lastIndexedContentHash,
    createdAt: document.created_at || document.createdAt,
    updatedAt: document.updated_at || document.updatedAt,
    // Path fields from document-path utils
    path: document.path,
    fullPath: document.full_path || document.fullPath,
  };
}

/**
 * Transforms a document list item from database format to API format
 */
export function transformDocumentListItem(document: any): any {
  if (!document) return null;

  return {
    id: document.id,
    title: document.title,
    slug: document.slug,
    path: document.path,
    fullPath: document.full_path || document.fullPath,
    published: document.published,
    createdAt: document.created_at || document.createdAt,
    updatedAt: document.updated_at || document.updatedAt,
  };
}

/**
 * Transforms a folder object from database format to API format
 */
export function transformFolder(folder: any): any {
  if (!folder) return null;

  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parent_id || folder.parentId,
    path: folder.path,
    documentCount: parseInt(folder.document_count) || 0,
    createdAt: folder.created_at || folder.createdAt,
    updatedAt: folder.updated_at || folder.updatedAt,
  };
}
