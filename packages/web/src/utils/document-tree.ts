/**
 * Finds all ancestor document IDs for a given document by traversing parent_id chain
 * Returns empty set if document not found or has no parents
 */
export function getAncestorIds(
  documentId: string | undefined,
  documents: ReadonlyArray<{ id: string; parent_id: string | null }>,
): Set<string> {
  if (!documentId) return new Set();

  const ancestors = new Set<string>();
  const docMap = new Map(documents.map((d) => [d.id, d]));

  let currentId: string | null = documentId;
  while (currentId) {
    const doc = docMap.get(currentId);
    if (!doc || !doc.parent_id) break;

    ancestors.add(doc.parent_id);
    currentId = doc.parent_id;
  }

  return ancestors;
}
