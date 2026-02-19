import { LydieClient } from "@lydie-app/sdk/client";
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
    return `/resources/knowledge-bases/${slugOrId}`;
  }

  if (collectionHandle === collections.noteTaking) {
    return `/resources/note-taking/${slugOrId}`;
  }

  return `/${slugOrId}`;
}

export async function getCollectionDocuments(
  collectionHandle: string,
  options?: {
    includeRelated?: boolean;
    includeToc?: boolean;
    filters?: Record<string, string | number | boolean>;
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
