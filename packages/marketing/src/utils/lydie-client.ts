import type { DocumentListItem } from "@lydie/core/content";

const apiKey = process.env.LYDIE_API_KEY || import.meta.env.LYDIE_API_KEY;
const apiUrl = "https://api.lydie.co/api/v1";

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
  related?: Array<Record<string, unknown>> | string[];
  toc?: Array<{ id: string; level: number; text: string }>;
};

function withAuth() {
  return {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  };
}

function parseListEnvelope(payload: unknown): { documents: CollectionApiDocument[] } {
  if (!payload || typeof payload !== "object") return { documents: [] };
  const data = (payload as { data?: unknown }).data;
  return {
    documents: Array.isArray(data) ? (data as CollectionApiDocument[]) : [],
  };
}

function parseSingleEnvelope(payload: unknown): CollectionApiDocument {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid API response");
  }

  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid API response");
  }

  return data as CollectionApiDocument;
}

// Build path map from documents with parent relations
export function buildPathMap(documents: CollectionApiDocument[]): Map<string, string> {
  const pathMap = new Map<string, string>();
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  const visiting = new Set<string>();

  function getPath(documentId: string): string {
    const cached = pathMap.get(documentId);
    if (cached) return cached;

    if (visiting.has(documentId)) return "/";

    const doc = byId.get(documentId);
    if (!doc) return "/";

    visiting.add(documentId);

    const parentId = doc.fields?.parent as string | undefined;
    const rawSlug = typeof doc.fields?.slug === "string" ? doc.fields.slug.trim() : "";
    const slugSegment = rawSlug.replace(/^\/+|\/+$/g, "");

    let path: string;
    if (!parentId) {
      path = slugSegment ? `/${slugSegment}` : "/";
    } else {
      const parentPath = getPath(parentId);
      path = parentPath === "/" ? `/${slugSegment}` : `${parentPath}/${slugSegment}`;
    }

    visiting.delete(documentId);
    pathMap.set(documentId, path);
    return path;
  }

  for (const doc of documents) getPath(doc.id);

  return pathMap;
}

export function getCollectionDocumentPath(collectionHandle: string, path: string): string {
  if (collectionHandle === collections.blog) return path === "/" ? "/blog" : `/blog${path}`;
  if (collectionHandle === collections.knowledgeBases) {
    return path === "/" ? "/knowledge-bases" : `/knowledge-bases${path}`;
  }
  if (collectionHandle === collections.noteTaking) {
    return path === "/" ? "/note-taking" : `/note-taking${path}`;
  }
  if (collectionHandle === collections.documentation) return path === "/" ? "/docs" : `/docs${path}`;
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

  const includes: string[] = [];
  if (options?.includeRelated) includes.push("related");
  if (includes.length > 0) params.set("include", includes.join(","));

  if (typeof options?.relatedLimit === "number") params.set("related_limit", String(options.relatedLimit));
  if (options?.includeToc) params.set("include_toc", "true");

  if (options?.filters) {
    for (const [key, value] of Object.entries(options.filters)) {
      params.set(`filter[${key}]`, String(value));
    }
  }

  if (options?.sortBy) {
    const sortOrder = options.sortOrder === "asc" ? "" : "-";
    params.set("sort", `${sortOrder}${options.sortBy}`);
  }

  const response = await fetch(
    `${apiUrl}/collections/${encodeURIComponent(collectionHandle)}/documents${
      params.toString() ? `?${params.toString()}` : ""
    }`,
    withAuth(),
  );

  if (!response.ok) {
    return { documents: [] };
  }

  return parseListEnvelope(await response.json());
}

export async function getCollectionDocument(
  collectionHandle: string,
  documentIdOrPropertyValue: string,
  options?: CollectionRelatedOptions & {
    includeToc?: boolean;
    by?: string;
  },
): Promise<CollectionApiDocument> {
  const params = new URLSearchParams();

  const includes: string[] = [];
  if (options?.includeRelated) includes.push("related");
  if (includes.length > 0) params.set("include", includes.join(","));

  if (typeof options?.relatedLimit === "number") params.set("related_limit", String(options.relatedLimit));
  if (options?.includeToc) params.set("include_toc", "true");
  if (options?.by) params.set("by", options.by);

  const response = await fetch(
    `${apiUrl}/collections/${encodeURIComponent(collectionHandle)}/documents/${encodeURIComponent(
      documentIdOrPropertyValue,
    )}${params.toString() ? `?${params.toString()}` : ""}`,
    withAuth(),
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch collection document: ${response.statusText}`);
  }

  return parseSingleEnvelope(await response.json());
}

export const getCollectionDocumentByIdentifier = getCollectionDocument;

export async function getDocumentsBySlugs(
  slugs: string[],
): Promise<{ documents: DocumentListItem[] }> {
  const params = new URLSearchParams();

  if (slugs.length > 0) {
    params.set("slugs", slugs.join(","));
  }

  const response = await fetch(`https://api.lydie.co/v1/documents/by-slugs?${params.toString()}`, withAuth());

  if (!response.ok) {
    throw new Error(`Failed to fetch documents by slugs: ${response.statusText}`);
  }

  return (await response.json()) as { documents: DocumentListItem[] };
}


export async function getCollectionRelatedDocuments(
  collectionHandle: string,
  documentId: string,
  limit = 5,
): Promise<CollectionApiDocument[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  const response = await fetch(
    `${apiUrl}/collections/${encodeURIComponent(collectionHandle)}/documents/${encodeURIComponent(documentId)}/related?${params.toString()}`,
    withAuth(),
  );

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as CollectionApiDocument[]) : [];
}

export const lydieClient = {
  getDocumentsBySlugs,
};

export async function getCollectionDocumentByPath(
  collectionHandle: string,
  targetPath: string,
  options?: CollectionRelatedOptions & {
    includeToc?: boolean;
  },
): Promise<CollectionApiDocument | null> {
  const { documents } = await getCollectionDocuments(collectionHandle, {
    includeRelated: options?.includeRelated,
    relatedScope: options?.relatedScope,
    relatedCollectionHandle: options?.relatedCollectionHandle,
    relatedLimit: options?.relatedLimit,
    includeToc: options?.includeToc,
  });

  const pathMap = buildPathMap(documents);
  const normalizedTarget = targetPath === "/" ? "/" : targetPath.replace(/\/$/, "");

  for (const doc of documents) {
    const docPath = pathMap.get(doc.id) || "/";
    const normalizedDocPath = docPath === "/" ? "/" : docPath.replace(/\/$/, "");

    if (normalizedDocPath === normalizedTarget) {
      return { ...doc, path: docPath };
    }
  }

  return null;
}

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

  const documentsWithPaths = documents.map((doc) => ({
    ...doc,
    path: pathMap.get(doc.id) || "/",
  }));

  return { documents: documentsWithPaths, pathMap };
}
