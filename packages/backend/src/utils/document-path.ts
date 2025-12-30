import { db } from "@lydie/database";
import { sql } from "drizzle-orm";
import {
  transformDocument,
  transformDocumentListItem,
  transformFolder,
} from "./field-transformer";

export async function getDocumentsWithPaths(
  organizationId: string,
  publishedOnly: boolean = false
) {
  // Use a recursive CTE to build folder paths
  const query = sql`
    WITH RECURSIVE folder_paths AS (
      -- Base case: root folders (no parent, not deleted)
      SELECT 
        id,
        name,
        parent_id,
        '/' || name || '/' as path,
        1 as level
      FROM folders 
      WHERE parent_id IS NULL
        AND deleted_at IS NULL
      
      UNION ALL
      
      -- Recursive case: child folders (not deleted)
      SELECT 
        f.id,
        f.name,
        f.parent_id,
        fp.path || f.name || '/' as path,
        fp.level + 1 as level
      FROM folders f
      INNER JOIN folder_paths fp ON f.parent_id = fp.id
      WHERE f.deleted_at IS NULL
    )
    SELECT 
      d.id,
      d.title,
      d.slug,
      d.json_content,
      d.user_id,
      d.organization_id,
      d.folder_id,
      d.published,
      d.created_at,
      d.updated_at,
      COALESCE(fp.path, '/') as path,
      CASE 
        WHEN fp.path IS NULL THEN '/' || d.slug
        ELSE RTRIM(fp.path, '/') || '/' || d.slug
      END as full_path
    FROM documents d
    LEFT JOIN folder_paths fp ON d.folder_id = fp.id
    WHERE d.organization_id = ${organizationId}
      AND d.deleted_at IS NULL
    ${publishedOnly ? sql`AND d.published = true` : sql``}
    ORDER BY d.created_at DESC
  `;

  const result = await db.execute(query);
  return result.map(transformDocumentListItem);
}

export async function getDocumentWithPath(
  slug: string,
  organizationId: string,
  publishedOnly: boolean = false
) {
  const query = sql`
    WITH RECURSIVE folder_paths AS (
      -- Base case: root folders (no parent, not deleted)
      SELECT 
        id,
        name,
        parent_id,
        '/' || name || '/' as path,
        1 as level
      FROM folders 
      WHERE parent_id IS NULL
        AND deleted_at IS NULL
      
      UNION ALL
      
      -- Recursive case: child folders (not deleted)
      SELECT 
        f.id,
        f.name,
        f.parent_id,
        fp.path || f.name || '/' as path,
        fp.level + 1 as level
      FROM folders f
      INNER JOIN folder_paths fp ON f.parent_id = fp.id
      WHERE f.deleted_at IS NULL
    )
    SELECT 
      d.*,
      COALESCE(fp.path, '/') as path,
      CASE 
        WHEN fp.path IS NULL THEN '/' || d.slug
        ELSE RTRIM(fp.path, '/') || '/' || d.slug
      END as full_path
    FROM documents d
    LEFT JOIN folder_paths fp ON d.folder_id = fp.id
    WHERE d.slug = ${slug} 
      AND d.organization_id = ${organizationId}
      AND d.deleted_at IS NULL
    ${publishedOnly ? sql`AND d.published = true` : sql``}
    LIMIT 1
  `;

  const result = await db.execute(query);
  const document = result[0] || null;
  return document ? transformDocument(document) : null;
}

/**
 * Gets a document by its full path (e.g., "/folder/subfolder/document-slug")
 * @param fullPath - Full document path
 * @param organizationId - Organization ID for scoping
 * @param publishedOnly - Whether to only include published documents
 * @returns Promise<object | null> - Document with computed path and fullPath
 */
export async function getDocumentByPath(
  fullPath: string,
  organizationId: string,
  publishedOnly: boolean = false
) {
  // Parse the full path to extract folder path and slug
  const lastSlashIndex = fullPath.lastIndexOf("/");
  const folderPath =
    lastSlashIndex > 0 ? fullPath.substring(0, lastSlashIndex + 1) : "/";
  const slug = fullPath.substring(lastSlashIndex + 1);

  const query = sql`
    WITH RECURSIVE folder_paths AS (
      -- Base case: root folders (no parent, not deleted)
      SELECT 
        id,
        name,
        parent_id,
        '/' || name || '/' as path,
        1 as level
      FROM folders 
      WHERE parent_id IS NULL
        AND deleted_at IS NULL
      
      UNION ALL
      
      -- Recursive case: child folders (not deleted)
      SELECT 
        f.id,
        f.name,
        f.parent_id,
        fp.path || f.name || '/' as path,
        fp.level + 1 as level
      FROM folders f
      INNER JOIN folder_paths fp ON f.parent_id = fp.id
      WHERE f.deleted_at IS NULL
    )
    SELECT 
      d.*,
      COALESCE(fp.path, '/') as path,
      CASE 
        WHEN fp.path IS NULL THEN '/' || d.slug
        ELSE RTRIM(fp.path, '/') || '/' || d.slug
      END as full_path
    FROM documents d
    LEFT JOIN folder_paths fp ON d.folder_id = fp.id
    WHERE d.slug = ${slug} 
      AND d.organization_id = ${organizationId}
      AND d.deleted_at IS NULL
      AND COALESCE(fp.path, '/') = ${folderPath}
    ${publishedOnly ? sql`AND d.published = true` : sql``}
    LIMIT 1
  `;

  const result = await db.execute(query);
  const document = result[0] || null;
  return document ? transformDocument(document) : null;
}

export async function getFoldersWithPaths(
  organizationId: string,
  publishedOnly: boolean = false
) {
  const query = sql`
    WITH RECURSIVE folder_paths AS (
      -- Base case: root folders (no parent, not deleted)
      SELECT 
        id,
        name,
        parent_id,
        user_id,
        created_at,
        updated_at,
        '/' || name || '/' as path,
        1 as level
      FROM folders 
      WHERE parent_id IS NULL
        AND deleted_at IS NULL
      
      UNION ALL
      
      -- Recursive case: child folders (not deleted)
      SELECT 
        f.id,
        f.name,
        f.parent_id,
        f.user_id,
        f.created_at,
        f.updated_at,
        fp.path || f.name || '/' as path,
        fp.level + 1 as level
      FROM folders f
      INNER JOIN folder_paths fp ON f.parent_id = fp.id
      WHERE f.deleted_at IS NULL
    )
    SELECT 
      fp.*,
      COUNT(d.id) as document_count
    FROM folder_paths fp
    LEFT JOIN documents d ON fp.id = d.folder_id 
      AND d.organization_id = ${organizationId}
      AND d.deleted_at IS NULL
    ${publishedOnly ? sql`AND d.published = true` : sql``}
    GROUP BY fp.id, fp.name, fp.parent_id, fp.user_id, fp.created_at, fp.updated_at, fp.path, fp.level
    ORDER BY fp.level, fp.name
  `;

  const result = await db.execute(query);
  return result.map(transformFolder);
}

/**
 * Validates that a path is safe and follows expected format
 * @param path - Path to validate
 * @returns boolean - True if path is valid
 */
export function isValidPath(path: string): boolean {
  // Path should start and end with /
  if (!path.startsWith("/")) {
    return false;
  }

  // Path should not contain consecutive slashes or invalid characters
  const segments = path.split("/").filter(Boolean);

  for (const segment of segments) {
    if (segment.includes("..") || segment.includes("//")) {
      return false;
    }

    // Check for invalid URL characters (basic validation)
    if (!/^[a-zA-Z0-9\-_\s]+$/.test(segment)) {
      return false;
    }
  }

  return true;
}
