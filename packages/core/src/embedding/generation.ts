/**
 * Embedding generation utilities
 */

import { embed, embedMany } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { Resource } from "sst";

// Initialize OpenAI client
const openAi = createOpenAI({ apiKey: Resource.OpenAiApiKey.value });

// Embedding model configuration
export const embeddingModel = openAi.embedding("text-embedding-ada-002");

/**
 * Generate a single embedding for a text value
 */
export async function generateEmbedding(value: string): Promise<number[]> {
  const input = value.replaceAll("\\n", " ");
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return embedding;
}

/**
 * Generate an embedding for a document title
 */
export async function generateTitleEmbedding(title: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: title,
  });
  return embedding;
}

/**
 * Generate embeddings for multiple text values
 */
export async function generateManyEmbeddings(
  values: string[]
): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values,
  });
  return embeddings;
}

