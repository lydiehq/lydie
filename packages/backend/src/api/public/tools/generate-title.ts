import { zValidator } from "@hono/zod-validator";
import { google } from "@lydie/core/ai/llm";
import { generateText, Output } from "ai";
import { Hono } from "hono";
import { z } from "zod";

const titleSchema = z.object({
  description: z.string().min(10).max(1000),
  keywords: z.string().max(500).optional(),
  contentType: z.enum(["blog", "article", "video", "social"]).default("blog"),
  tone: z
    .enum(["professional", "friendly", "engaging", "informative", "exciting"])
    .default("friendly"),
});

const titlesOutputSchema = z.object({
  titles: z.array(z.string()).length(5),
});

export const GenerateTitleRoute = new Hono().post(
  "/",
  zValidator("json", titleSchema),
  async (c) => {
    const { description, keywords, contentType, tone } = c.req.valid("json");

    try {
      const contentTypeDescriptions = {
        blog: "blog post",
        article: "article",
        video: "video",
        social: "social media post",
      };

      const toneDescriptions = {
        professional: "professional and authoritative",
        friendly: "friendly and approachable",
        engaging: "engaging and curiosity-driven",
        informative: "informative and educational",
        exciting: "exciting and attention-grabbing",
      };

      const prompt = `You are an expert copywriter specializing in creating compelling titles and headlines. Generate 5 unique, high-quality titles for a ${contentTypeDescriptions[contentType]} with a ${toneDescriptions[tone]} tone.

Content Description:
${description}

${keywords ? `Keywords to consider: ${keywords}\n` : ""}
Requirements:
- Create 5 distinct title options
- Make each title compelling and attention-grabbing
- Ensure titles accurately reflect the content description
- Match the ${toneDescriptions[tone]} tone
- Optimize for ${contentType === "blog" || contentType === "article" ? "SEO and readability" : contentType === "video" ? "click-through rate and curiosity" : "social media engagement and brevity"}
${contentType === "social" ? "- Keep titles concise (under 100 characters when possible)\n" : ""}
${contentType === "video" ? "- Include elements that spark curiosity or promise value\n" : ""}
${contentType === "blog" ? "- Consider using numbers, questions, or how-to formats where appropriate\n" : ""}`;

      const { output } = await generateText({
        model: google("gemini-2.5-flash-lite"),
        prompt,
        maxOutputTokens: 1000,
        output: Output.object({
          schema: titlesOutputSchema,
          name: "titles",
          description: "Exactly 5 unique title strings for the content",
        }),
      });

      return c.json({
        titles: output.titles,
        contentType,
        tone,
      });
    } catch (error) {
      console.error("Title generation error:", error);

      return c.json(
        {
          error: "Generation failed",
          message: "Failed to generate titles. Please try again.",
        },
        500,
      );
    }
  },
);
