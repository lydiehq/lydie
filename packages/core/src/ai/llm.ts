import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { Resource } from "sst";

export const google = createGoogleGenerativeAI({
  apiKey: Resource.GoogleAiStudioApiKey.value,
});

export const openAi = createOpenAI({ apiKey: Resource.OpenAiApiKey.value });
