import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { Resource } from "sst";

const openAi = createOpenAI({ apiKey: Resource.OpenAiApiKey.value });

const embeddingModel = openAi.embedding("text-embedding-3-small");

export async function generateEmbedding(value: string): Promise<number[]> {
  const input = value.replaceAll("\\n", " ");
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return embedding;
}

export async function generateTitleEmbedding(title: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel,
    value: title,
  });
  return embedding;
}

export async function generateManyEmbeddings(values: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values,
  });
  return embeddings;
}
