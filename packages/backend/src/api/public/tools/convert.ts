import { exec } from "child_process";
import { randomUUID } from "crypto";
import { readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

const execAsync = promisify(exec);
let pandocAvailable: Promise<boolean> | undefined;

function isPandocAvailable(): Promise<boolean> {
  pandocAvailable ??= execAsync("pandoc --version")
    .then(() => true)
    .catch(() => false);

  return pandocAvailable;
}

const convertSchema = z.object({
  content: z.string().max(1_000_000), // 1MB text limit
  from: z.enum(["markdown", "html", "rst", "textile", "org", "docx"]),
  to: z.enum(["html", "pdf", "docx", "odt", "epub", "rst", "txt", "mediawiki"]),
  options: z
    .object({
      standalone: z.boolean().optional().default(true),
      toc: z.boolean().optional().default(false),
    })
    .optional(),
});

export const ConvertRoute = new Hono().post("/", zValidator("json", convertSchema), async (c) => {
  if (!(await isPandocAvailable())) {
    return c.json(
      {
        error: "Conversion unavailable",
        message: "File conversion is disabled on this deployment.",
      },
      503,
    );
  }

  const { content, from, to, options } = c.req.valid("json");

  const inputId = randomUUID();
  const inputPath = path.join("/tmp", `${inputId}.${from}`);
  const outputPath = path.join("/tmp", `${inputId}.${to}`);

  try {
    await writeFile(inputPath, content, "utf-8");

    const args = [`"${inputPath}"`, "-o", `"${outputPath}"`, "-f", from, "-t", to];

    if (options?.standalone) args.push("--standalone");
    if (options?.toc) args.push("--toc");

    const { stderr } = await execAsync(`pandoc ${args.join(" ")}`, {
      timeout: 30000, // 30 second timeout
    });

    if (stderr) {
      console.warn("Pandoc warning:", stderr);
    }

    const outputBuffer = await readFile(outputPath);

    await Promise.all([unlink(inputPath).catch(() => {}), unlink(outputPath).catch(() => {})]);

    const contentTypes: Record<string, string> = {
      html: "text/html",
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      odt: "application/vnd.oasis.opendocument.text",
      epub: "application/epub+zip",
      rst: "text/plain",
      txt: "text/plain",
      mediawiki: "text/plain",
    };

    return new Response(outputBuffer, {
      headers: {
        "Content-Type": contentTypes[to] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="document.${to}"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Conversion error:", error);

    await Promise.all([unlink(inputPath).catch(() => {}), unlink(outputPath).catch(() => {})]);

    return c.json(
      {
        error: "Conversion failed",
        message: "Conversion failed. Please try again.",
      },
      500,
    );
  }
});
