import { zValidator } from "@hono/zod-validator";
import { google } from "@lydie/core/ai/llm";
import { generateText } from "ai";
import { Hono } from "hono";
import { z } from "zod";

const formatSchema = z.object({
  content: z.string().min(1).max(50000),
  format: z.enum(["markdown", "html", "plain"]).default("markdown"),
  style: z.enum(["professional", "academic", "casual", "structured"]).default("professional"),
});

export const FormatDocumentRoute = new Hono().post(
  "/",
  zValidator("json", formatSchema),
  async (c) => {
    const { content, format, style } = c.req.valid("json");

    try {
      const stylePrompts = {
        professional: `Format this document in a professional style suitable for business documents, reports, and formal communications. Use clear headings, consistent formatting, and a polished tone.`,
        academic: `Format this document in an academic style suitable for research papers, essays, and scholarly work. Use proper citation formatting, formal language, and structured sections.`,
        casual: `Format this document in a casual, reader-friendly style suitable for blog posts, newsletters, and informal content. Use engaging language and clear, accessible formatting.`,
        structured: `Format this document with maximum structure and organization. Use hierarchical headings, bullet points, numbered lists, and clear section breaks to make the content highly scannable.`,
      };

      const formatInstructions = {
        markdown: `Output the formatted document in Markdown format with proper headings (# ## ###), lists (- or 1.), bold/italic (** or *), and code blocks (\`\`\`) where appropriate.`,
        html: `Output the formatted document in clean HTML format with semantic tags (h1, h2, h3, p, ul, ol, li, strong, em, code, etc.). Do not include html, head, or body tags - just the content structure.`,
        plain: `Output the formatted document in plain text format. Use clear visual separation with blank lines and simple ASCII formatting (like dashes for lists).`,
      };

      const prompt = `You are an expert document formatter. Your task is to take the following content and format it professionally.

${stylePrompts[style]}

${formatInstructions[format]}

Original content to format:
---
${content}
---

Instructions:
1. Fix any formatting inconsistencies
2. Improve readability with proper structure
3. Add appropriate headings and sections
4. Use lists where beneficial
5. Maintain the original meaning and content
6. Do NOT add new information not present in the original
7. Do NOT summarize or remove content unless it's redundant formatting artifacts

Output only the formatted document, nothing else.`;

      const result = await generateText({
        model: google("gemini-2.5-flash-lite"),
        prompt,
        maxOutputTokens: 8000,
      });

      const formattedContent = result.text.trim();

      return c.json({
        formattedContent,
        format,
        style,
      });
    } catch (error) {
      console.error("Document formatting error:", error);

      return c.json(
        {
          error: "Formatting failed",
          message: "Failed to format document. Please try again.",
        },
        500,
      );
    }
  },
);
