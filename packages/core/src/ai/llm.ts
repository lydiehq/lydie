import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";

import { env } from "../env";

export const google = env.GOOGLE_AI_STUDIO_API_KEY
  ? createGoogleGenerativeAI({
      apiKey: env.GOOGLE_AI_STUDIO_API_KEY,
    })
  : null;

export const openAi = env.OPENAI_API_KEY ? createOpenAI({ apiKey: env.OPENAI_API_KEY }) : null;
