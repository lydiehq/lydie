import type { DocumentListItem } from "@lydie/core/content";

const apiKey = process.env.LYDIE_API_KEY!;
const organizationId = "lydie";
const apiUrl = "https://api.lydie.co/v1";

export const collections = {
  blog: "blog",
  knowledgeBases: "knowledge-bases",
  noteTaking: "note-taking",
  documentation: "documentation",
} as const;

type CollectionFieldValue = string | number | boolean | null;
type RelatedScope = "any" | "same_collection" | "collection_handle";

type CollectionRelatedOptions = {
  includeRelated?: boolean;
  relatedScope?: RelatedScope;
  relatedCollectionHandle?: string;
  relatedLimit?: number;
};

export type CollectionApiDocument = Record<string, unknown> & {
  id: string;
  title: string;
  fields?: Record<string, CollectionFieldValue>;
  related?: Array<Record<string, unknown>>;
  toc?: Array<{ id: string; level: number; text: string }>;
};

// Build path map from documents with parent relations
export function buildPathMap(documents: CollectionApiDocument[]): Map<string, string> {
  const pathMap = new Map<string, string>();
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const visiting = new Set<string>();

  function getPath(documentId: string): string {
    const cached = pathMap.get(documentId);
    if (cached) return cached;

    if (visiting.has(documentId)) {
      return "/";
    }

    const doc = byId.get(documentId);
    if (!doc) return "/";

    visiting.add(documentId);

    const parentId = doc.fields?.parent as string | undefined;
    const rawSlug = typeof doc.fields?.slug === "string" ? doc.fields.slug.trim() : "";
    const slugSegment = rawSlug.replace(/^\/+|\/+$/g, "");
    const segment = slugSegment;

    let path: string;
    if (!parentId) {
      path = slugSegment ? `/${slugSegment}` : "/";
    } else {
      const parentPath = getPath(parentId);
      path = parentPath === "/" ? `/${segment}` : `${parentPath}/${segment}`;
    }

    visiting.delete(documentId);
    pathMap.set(documentId, path);
    return path;
  }

  for (const doc of documents) {
    getPath(doc.id);
  }

  return pathMap;
}

export function getCollectionDocumentPath(collectionHandle: string, path: string): string {
  if (collectionHandle === collections.blog) {
    return path === "/" ? "/blog" : `/blog${path}`;
  }

  if (collectionHandle === collections.knowledgeBases) {
    return path === "/" ? "/knowledge-bases" : `/knowledge-bases${path}`;
  }

  if (collectionHandle === collections.noteTaking) {
    return path === "/" ? "/note-taking" : `/note-taking${path}`;
  }

  if (collectionHandle === collections.documentation) {
    return path === "/" ? "/docs" : `/docs${path}`;
  }

  return path;
}

export async function getCollectionDocuments(
  collectionHandle: string,
  options?: CollectionRelatedOptions & {
    includeToc?: boolean;
    filters?: Record<string, string | number | boolean>;
    sortBy?: "created_at" | "updated_at" | "title";
    sortOrder?: "asc" | "desc";
  },
): Promise<{ documents: CollectionApiDocument[] }> {
  const params = new URLSearchParams();

  if (options?.includeRelated) {
    params.set("include_related", "true");
  }

  if (options?.relatedScope) {
    params.set("related_scope", options.relatedScope);
  }

  if (options?.relatedCollectionHandle) {
    params.set("related_collection_handle", options.relatedCollectionHandle);
  }

  if (typeof options?.relatedLimit === "number") {
    params.set("related_limit", String(options.relatedLimit));
  }

  if (options?.includeToc) {
    params.set("include_toc", "true");
  }

  if (options?.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      params.set(`filter[${key}]`, String(value));
    }
  }

  if (options?.sortBy) {
    params.set("sort_by", options.sortBy);
  }

  if (options?.sortOrder) {
    params.set("sort_order", options.sortOrder);
  }

  const response = await fetch(
    `${apiUrl}/${organizationId}/${collectionHandle}/documents${
      params.toString() ? `?${params.toString()}` : ""
    }`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    return { documents: [] };
  }

  return (await response.json()) as {
    documents: CollectionApiDocument[];
  };
}

export async function getCollectionDocument(
  collectionHandle: string,
  documentIdOrPropertyValue: string,
  options?: CollectionRelatedOptions & {
    includeToc?: boolean;
  },
): Promise<CollectionApiDocument> {
  const params = new URLSearchParams();

  if (options?.includeRelated) {
    params.set("include_related", "true");
  }

  if (options?.relatedScope) {
    params.set("related_scope", options.relatedScope);
  }

  if (options?.relatedCollectionHandle) {
    params.set("related_collection_handle", options.relatedCollectionHandle);
  }

  if (typeof options?.relatedLimit === "number") {
    params.set("related_limit", String(options.relatedLimit));
  }

  if (options?.includeToc) {
    params.set("include_toc", "true");
  }

  const response = await fetch(
    `${apiUrl}/${organizationId}/${collectionHandle}/documents/${encodeURIComponent(
      documentIdOrPropertyValue,
    )}${params.toString() ? `?${params.toString()}` : ""}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch collection document: ${response.statusText}`);
  }

  return (await response.json()) as CollectionApiDocument;
}

export const getCollectionDocumentByIdentifier = getCollectionDocument;

export async function getDocumentsBySlugs(
  slugs: string[],
): Promise<{ documents: DocumentListItem[] }> {
  const params = new URLSearchParams();

  if (slugs.length > 0) {
    params.set("slugs", slugs.join(","));
  }

  console.log("Using API Key:", apiKey);

  const response = await fetch(
    `${apiUrl}/${organizationId}/documents/by-slugs?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch documents by slugs: ${response.statusText}`);
  }

  return (await response.json()) as { documents: DocumentListItem[] };
}

export const lydieClient = {
  getDocumentsBySlugs,
};

// Fetch a document by its path within a collection
export async function getCollectionDocumentByPath(
  collectionHandle: string,
  targetPath: string,
  options?: CollectionRelatedOptions & {
    includeToc?: boolean;
  },
): Promise<CollectionApiDocument | null> {
  // Fetch all documents to build the path map
  const { documents } = await getCollectionDocuments(collectionHandle, {
    includeRelated: options?.includeRelated,
    relatedScope: options?.relatedScope,
    relatedCollectionHandle: options?.relatedCollectionHandle,
    relatedLimit: options?.relatedLimit,
    includeToc: options?.includeToc,
  });

  const pathMap = buildPathMap(documents);

  // Find document with matching path
  const normalizedTarget = targetPath === "/" ? "/" : targetPath.replace(/\/$/, "");

  for (const doc of documents) {
    const docPath = pathMap.get(doc.id) || "/";
    const normalizedDocPath = docPath === "/" ? "/" : docPath.replace(/\/$/, "");

    if (normalizedDocPath === normalizedTarget) {
      // Attach the computed path to the document
      return { ...doc, path: docPath };
    }
  }

  return null;
}

// Get all documents with their computed paths
export async function getCollectionDocumentsWithPaths(
  collectionHandle: string,
  options?: CollectionRelatedOptions & {
    includeToc?: boolean;
    sortBy?: "created_at" | "updated_at" | "title";
    sortOrder?: "asc" | "desc";
  },
): Promise<{ documents: CollectionApiDocument[]; pathMap: Map<string, string> }> {
  const { documents } = await getCollectionDocuments(collectionHandle, options);
  const pathMap = buildPathMap(documents);

  // Attach paths to documents
  const documentsWithPaths = documents.map((doc) => ({
    ...doc,
    path: pathMap.get(doc.id) || "/",
  }));

  return { documents: documentsWithPaths, pathMap };
}
