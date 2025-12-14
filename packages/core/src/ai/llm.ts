import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { Resource } from "sst";

export const google = createGoogleGenerativeAI({
  apiKey: Resource.GoogleAiStudioApiKey.value,
});
export const openAi = createOpenAI({ apiKey: Resource.OpenAiApiKey.value });

// TODO: remove
export const basicModel = google("gemini-2.5-flash-lite-preview-09-2025");
export const advancedModel = google("gemini-2.5-flash");

export const documentChatModel = google("gemini-2.5-flash");
export const suggestionModel = google("gemini-2.5-flash");

export const embeddingModel = openAi.embedding("text-embedding-ada-002");
