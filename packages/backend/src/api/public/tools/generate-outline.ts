import { zValidator } from "@hono/zod-validator";
import { google } from "@lydie/core/ai/llm";
import { generateText } from "ai";
import { Hono } from "hono";
import { z } from "zod";

const outlineSchema = z.object({
  topic: z.string().min(1).max(500),
  context: z.string().max(2000).optional(),
  type: z.enum(["article", "essay", "report"]).default("article"),
});

export const GenerateOutlineRoute = new Hono().post(
  "/",
  zValidator("json", outlineSchema),
  async (c) => {
    const { topic, context, type } = c.req.valid("json");

    try {
      const prompts = {
        article: `You are an expert content strategist. Create a comprehensive outline for an article about "${topic}".

${context ? `Additional context: ${context}\n` : ""}
Generate a well-structured outline with:
- A compelling introduction hook
- 3-5 main sections with descriptive subsections
- Key points to cover in each section
- A strong conclusion

Format the outline in Markdown with clear hierarchy using # for main sections and ## for subsections.`,
        essay: `You are an academic writing expert. Create a structured outline for an essay about "${topic}".

${context ? `Additional context: ${context}\n` : ""}
Generate a comprehensive outline with:
- Introduction (with thesis statement)
- Body paragraphs (3-5) with topic sentences and supporting points
- Counterarguments and rebuttals
- Conclusion with synthesis

Format the outline in Markdown with clear hierarchy using # for main sections and ## for subsections.`,
        report: `You are a professional report writer. Create a detailed outline for a report about "${topic}".

${context ? `Additional context: ${context}\n` : ""}
Generate a professional outline with:
- Executive Summary
- Introduction and Background
- Methodology (if applicable)
- Findings/Analysis (3-5 main sections)
- Recommendations
- Conclusion

Format the outline in Markdown with clear hierarchy using # for main sections and ## for subsections.`,
      };

      const prompt = prompts[type];

      const result = await generateText({
        model: google("gemini-2.5-flash-lite"),
        prompt,
        maxOutputTokens: 2000,
      });

      const outline = result.text.trim();

      return c.json({
        outline,
        type,
      });
    } catch (error) {
      console.error("Outline generation error:", error);

      return c.json(
        {
          error: "Generation failed",
          message: "Failed to generate outline. Please try again.",
        },
        500,
      );
    }
  },
);
