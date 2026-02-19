import { LydieClient } from "@lydie-app/sdk/client";
import { normalizeCollectionRoute } from "@lydie/core/collection-routes";
import { Resource } from "sst";

const apiKey = Resource.LydieApiKey.value;
const organizationId = "lydie";
const apiUrl = "https://api.lydie.co/v1";

export const lydieClient = new LydieClient({
  apiKey,
  debug: true,
  organizationId,
  apiUrl,
});

export const collections = {
  blog: "blog",
  knowledgeBases: "knowledge-bases",
  noteTaking: "note-taking",
  documentation: "documentation",
} as const;

type CollectionFieldValue = string | number | boolean | null;

export type CollectionApiDocument = Record<string, unknown> & {
  id: string;
  title: string;
  fields?: Record<string, CollectionFieldValue>;
  related?: Array<Record<string, unknown>>;
};

export function getCollectionDocumentPath(collectionHandle: string, slugOrId: string): string {
  if (collectionHandle === collections.blog) {
    return `/blog/${slugOrId}`;
  }

  if (collectionHandle === collections.knowledgeBases) {
    return `/knowledge-bases/${slugOrId}`;
  }

  if (collectionHandle === collections.noteTaking) {
    return `/note-taking/${slugOrId}`;
  }

  if (collectionHandle === collections.documentation) {
    const normalized = normalizeCollectionRoute(slugOrId);
    return normalized === "/" ? "/docs" : `/docs${normalized}`;
  }

  return `/${slugOrId}`;
}

export async function getCollectionDocumentByRoute(
  collectionHandle: string,
  route: string,
  options?: {
    includeRelated?: boolean;
    includeToc?: boolean;
  },
): Promise<CollectionApiDocument> {
  const params = new URLSearchParams();

  if (options?.includeRelated) {
    params.set("include_related", "true");
  }
  if (options?.includeToc) {
    params.set("include_toc", "true");
  }

  const normalizedRoute = normalizeCollectionRoute(route);
  const isRoot = normalizedRoute === "/";
  const routePath = isRoot
    ? `${apiUrl}/${organizationId}/${collectionHandle}/routes`
    : `${apiUrl}/${organizationId}/${collectionHandle}/routes/${normalizedRoute.replace(/^\/+/, "")}`;

  const response = await fetch(`${routePath}${params.toString() ? `?${params.toString()}` : ""}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch collection route: ${response.statusText}`);
  }

  return (await response.json()) as CollectionApiDocument;
}

export async function getCollectionDocuments(
  collectionHandle: string,
  options?: {
    includeRelated?: boolean;
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
    throw new Error(`Failed to fetch collection documents: ${response.statusText}`);
  }

  return (await response.json()) as {
    documents: CollectionApiDocument[];
  };
}
