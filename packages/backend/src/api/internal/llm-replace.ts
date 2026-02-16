import { google } from "@lydie/core/ai/llm";
import { VisibleError } from "@lydie/core/error";
import { generateText } from "ai";
import { Hono } from "hono";
import { z } from "zod";

const requestSchema = z.object({
  currentHTML: z.string(),
  selectionWithEllipsis: z.string(),
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
    const { currentHTML, selectionWithEllipsis } = requestSchema.parse(body);

    const ellipsisIndex = selectionWithEllipsis.indexOf("...");
    let startPattern = "";
    let endPattern = "";

    if (ellipsisIndex !== -1) {
      startPattern = selectionWithEllipsis.substring(0, ellipsisIndex).trim();
      endPattern = selectionWithEllipsis.substring(ellipsisIndex + 3).trim();
    }

    const prompt = `Find content in this HTML document matching the pattern "${startPattern}...${endPattern}".

Document:
${currentHTML}

Find the exact substring that:
1. Starts with "${startPattern}" ${startPattern ? "(or document start if empty)" : ""}
2. Ends with "${endPattern}" ${endPattern ? "(or document end if empty)" : ""}
3. Includes everything in between

Return ONLY the exact substring from the document, or "NOT_FOUND" if no match.`;

    const { text } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      prompt,
      temperature: 0,
    });

    const exactMatch = text.trim();

    if (exactMatch === "NOT_FOUND" || !currentHTML.includes(exactMatch)) {
      return c.json({ success: false, exactMatch: null });
    }

    return c.json({ success: true, exactMatch });
  } catch (error) {
    console.error("LLM replace error:", error);

    if (error instanceof z.ZodError) {
      throw new VisibleError("invalid_request_parameters", "Invalid request parameters");
    }

    throw new VisibleError("failed_to_process_replacement", "Failed to process replacement");
  }
});
