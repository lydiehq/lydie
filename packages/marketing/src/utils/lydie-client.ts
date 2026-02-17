import { LydieClient } from "@lydie-app/sdk/client";
import { Resource } from "sst";

const isProduction = Resource.App.stage === "production" || false;

const apiKey = isProduction ? Resource.LydieApiKey.value : "lydie_test_rWCzeEgVy2KhZe33";
const organizationId = isProduction ? "WQnJeE7uYmhinDSE" : "larss-workspace-psvnnuyg";
const apiUrl = isProduction ? "https://api.lydie.co/v1" : "http://localhost:3001/v1";

export const lydieClient = new LydieClient({
  apiKey,
  debug: true,
  organizationId,
  apiUrl,
});

type CollectionFieldValue = string | number | boolean | null;

export type CollectionApiDocument = Record<string, unknown> & {
  id: string;
  title: string;
  fields?: Record<string, CollectionFieldValue>;
  related?: Array<Record<string, unknown>>;
};

export async function getCollectionDocuments(
  collectionId: string,
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
    `${apiUrl}/${organizationId}/collections/${collectionId}/documents${
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
