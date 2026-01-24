import type { Transaction } from "@rocicorp/zero"
import { zql } from "../schema"
import { notFoundError } from "./errors"

/**
 * Verifies that a document exists and belongs to the specified organization
 * Throws an error if the document is not found
 */
export async function verifyDocumentAccess(
  tx: Transaction,
  documentId: string,
  organizationId: string,
  includeDeleted = false,
) {
  const query = zql.documents
    .where("id", documentId)
    .where("organization_id", organizationId)

  if (!includeDeleted) {
    query.where("deleted_at", "IS", null)
  }

  const document = await tx.run(query.one())

  if (!document) {
    throw notFoundError("Document", documentId)
  }

  return document
}

/**
 * Gets a document by ID and organization ID
 * Returns null if not found (doesn't throw)
 */
export async function getDocumentById(
  tx: Transaction,
  documentId: string,
  organizationId: string,
  includeDeleted = false,
) {
  const query = zql.documents
    .where("id", documentId)
    .where("organization_id", organizationId)

  if (!includeDeleted) {
    query.where("deleted_at", "IS", null)
  }

  return await tx.run(query.one())
}

/**
 * Recursively finds all child documents of a parent document
 */
export async function findAllChildDocuments(
  tx: Transaction,
  parentId: string,
  organizationId: string,
  childIds: string[] = [],
): Promise<string[]> {
  const children = await tx.run(
    zql.documents
      .where("parent_id", parentId)
      .where("organization_id", organizationId)
      .where("deleted_at", "IS", null),
  )

  for (const child of children) {
    childIds.push(child.id)
    // Recursively get children of this child
    await findAllChildDocuments(tx, child.id, organizationId, childIds)
  }

  return childIds
}
