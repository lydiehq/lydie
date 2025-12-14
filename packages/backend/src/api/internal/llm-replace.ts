import { Hono } from "hono";
import { google } from "@lydie/core/ai/llm";
import { generateText } from "ai";
import { VisibleError } from "@lydie/core/error";
import { z } from "zod";

const requestSchema = z.object({
  currentHTML: z.string(),
  searchText: z.string(),
  replaceText: z.string(),
});

export const LLMReplaceRoute = new Hono<{
  Variables: {
    organizationId: string;
    user: any;
  };
}>().post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { currentHTML, searchText } = requestSchema.parse(body);

    const prompt = `You are helping to locate content in an HTML document for replacement. The search text provided may not match exactly due to HTML attribute differences, whitespace, or formatting variations.

Current document HTML:
${currentHTML}

Search text (may not match exactly due to formatting):
${searchText}

Your task: Find the exact substring from the current document that best matches the search text intent. Return ONLY the exact substring from the document, with no explanations, quotes, or other text.

Rules:
- The substring must exist verbatim in the current document
- Include any HTML tags that are part of the content
- Match the intent and meaning of the search text
- If the search text is not found at all, return "NOT_FOUND"`;

    const { text } = await generateText({
      model: google("gemini-2.5-flash-lite-preview-09-2025"),
      prompt,
      temperature: 0,
    });

    const exactMatch = text.trim();

    // Validate that the LLM didn't hallucinate
    if (exactMatch === "NOT_FOUND" || !currentHTML.includes(exactMatch)) {
      return c.json({
        success: false,
        error: "Could not find matching content in document",
        exactMatch: exactMatch === "NOT_FOUND" ? null : exactMatch,
      });
    }

    // Return the exact match so the client can do the replacement
    return c.json({
      success: true,
      exactMatch,
      originalSearch: searchText,
    });
  } catch (error) {
    console.error("LLM replace error:", error);

    if (error instanceof z.ZodError) {
      throw new VisibleError(
        "invalid_request_parameters",
        "Invalid request parameters"
      );
    }

    throw new VisibleError(
      "failed_to_process_replacement",
      "Failed to process replacement. Please try selecting the content more precisely."
    );
  }
});
