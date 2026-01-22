import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { exec } from "child_process"
import { promisify } from "util"
import { writeFile, unlink, readFile } from "fs/promises"
import { randomUUID } from "crypto"
import path from "path"
import { publicRateLimit } from "./middleware"

const execAsync = promisify(exec)

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
})

export const PublicApi = new Hono()
  .use(publicRateLimit)
  .post("/convert", zValidator("json", convertSchema), async (c) => {
    const { content, from, to, options } = c.req.valid("json")

    const inputId = randomUUID()
    const inputPath = path.join("/tmp", `${inputId}.${from}`)
    const outputPath = path.join("/tmp", `${inputId}.${to}`)

    try {
      // Write input to temp file
      await writeFile(inputPath, content, "utf-8")

      // Build pandoc command
      const args = [`"${inputPath}"`, "-o", `"${outputPath}"`, "-f", from, "-t", to]

      if (options?.standalone) args.push("--standalone")
      if (options?.toc) args.push("--toc")

      // Execute pandoc with timeout
      const { stdout, stderr } = await execAsync(`pandoc ${args.join(" ")}`, {
        timeout: 30000, // 30 second timeout
      })

      if (stderr) {
        console.warn("Pandoc warning:", stderr)
      }

      // Read output file
      const outputBuffer = await readFile(outputPath)

      // Cleanup temp files
      await Promise.all([unlink(inputPath).catch(() => {}), unlink(outputPath).catch(() => {})])

      // Determine content type
      const contentTypes: Record<string, string> = {
        html: "text/html",
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        odt: "application/vnd.oasis.opendocument.text",
        epub: "application/epub+zip",
        rst: "text/plain",
        txt: "text/plain",
        mediawiki: "text/plain",
      }

      return new Response(outputBuffer, {
        headers: {
          "Content-Type": contentTypes[to] || "application/octet-stream",
          "Content-Disposition": `attachment; filename="document.${to}"`,
          "Access-Control-Allow-Origin": "*", // Allow from marketing site
        },
      })
    } catch (error) {
      console.error("Conversion error:", error)

      await Promise.all([unlink(inputPath).catch(() => {}), unlink(outputPath).catch(() => {})])

      return c.json(
        {
          error: "Conversion failed",
          message: "Conversion failed. Please try again.",
        },
        500,
      )
    }
  })
