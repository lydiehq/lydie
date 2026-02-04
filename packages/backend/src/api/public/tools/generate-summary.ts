import { zValidator } from "@hono/zod-validator";
import { google } from "@lydie/core/ai/llm";
import { generateText } from "ai";
import { Hono } from "hono";
import { z } from "zod";

const summarySchema = z.object({
  text: z.string().min(100).max(50000),
  length: z.enum(["short", "medium", "detailed"]).default("medium"),
});

export const GenerateSummaryRoute = new Hono().post(
  "/",
  zValidator("json", summarySchema),
  async (c) => {
    const { text, length } = c.req.valid("json");

    try {
      const prompts = {
        short: `You are an expert at distilling information into concise summaries. Summarize the following text in 1-2 sentences that capture the main point.

Text to summarize:
${text}

Provide a brief, clear summary that captures the essence of the content.`,
        medium: `You are an expert at creating balanced summaries. Summarize the following text in a single paragraph that covers the key points and provides important context.

Text to summarize:
${text}

Provide a well-structured summary that captures the main ideas and essential details.`,
        detailed: `You are an expert at creating comprehensive summaries. Summarize the following text in multiple paragraphs that provide thorough coverage of all main ideas, key points, and important details.

Text to summarize:
${text}

Provide a detailed summary that:
- Covers all major themes and arguments
- Includes important supporting details and context
- Maintains logical flow and structure
- Captures nuance while remaining concise`,
      };

      const prompt = prompts[length];

      const result = await generateText({
        model: google("gemini-2.5-flash-lite"),
        prompt,
        maxOutputTokens: length === "short" ? 500 : length === "medium" ? 1000 : 2000,
      });

      const summary = result.text.trim();

      return c.json({
        summary,
        length,
      });
    } catch (error) {
      console.error("Summary generation error:", error);

      return c.json(
        {
          error: "Generation failed",
          message: "Failed to generate summary. Please try again.",
        },
        500,
      );
    }
  },
);
