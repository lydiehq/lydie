import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

import { env } from "../env";

const openAi = env.OPENAI_API_KEY ? createOpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

const embeddingModel = openAi?.embedding("text-embedding-3-small") ?? null;

function ensureEmbeddingModel() {
  if (!embeddingModel) {
    throw new Error("OPENAI_API_KEY is required for embeddings");
  }
  return embeddingModel;
}

export async function generateEmbedding(value: string): Promise<number[]> {
  const model = ensureEmbeddingModel();
  const input = value.replaceAll("\\n", " ");
  const { embedding } = await embed({
    model,
    value: input,
  });
  return embedding;
}

export async function generateTitleEmbedding(title: string): Promise<number[]> {
  const model = ensureEmbeddingModel();
  const { embedding } = await embed({
    model,
    value: title,
  });
  return embedding;
}

export async function generateManyEmbeddings(values: string[]): Promise<number[][]> {
  const model = ensureEmbeddingModel();
  const { embeddings } = await embedMany({
    model,
    values,
  });
  return embeddings;
}
