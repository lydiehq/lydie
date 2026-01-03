/**
 * Build-time script to generate thumbnails for document templates
 * This script reads template JSON files and generates preview images using Sharp
 * 
 * Note: For better rendering quality, consider using a headless browser (Puppeteer/Playwright)
 * in the future. This version creates simple text-based thumbnails.
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { extractText } from "@lydie/core/content";
import type { ContentNode } from "@lydie/core/content";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_DIR = join(__dirname, "../public/templates");
const THUMBNAILS_DIR = join(__dirname, "../public/templates/thumbnails");
const THUMBNAIL_WIDTH = 800;
const THUMBNAIL_HEIGHT = 600;

interface Template {
  title: string;
  category: string;
  description: string;
  content: ContentNode;
}

/**
 * Generate a simple thumbnail image using SVG and Sharp
 */
async function generateThumbnail(
  template: Template,
  outputPath: string
): Promise<void> {
  try {
    // Extract preview text from content
    const previewText = extractText(template.content);
    const truncatedText = previewText.length > 300 
      ? previewText.substring(0, 300) + "..." 
      : previewText;

    // Split text into lines for display
    const words = truncatedText.split(" ");
    const lines: string[] = [];
    let currentLine = "";
    const maxCharsPerLine = 60;

    for (const word of words) {
      if ((currentLine + " " + word).length > maxCharsPerLine && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + " " + word : word;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Create SVG with text
    const svg = `
<svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  
  <!-- Title -->
  <text x="40" y="60" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
        font-size="32" font-weight="600" fill="#1a1a1a">${escapeXml(template.title)}</text>
  
  <!-- Description -->
  <text x="40" y="100" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
        font-size="16" fill="#666666">${escapeXml(template.description)}</text>
  
  <!-- Preview text -->
  ${lines.slice(0, 20).map((line, i) => 
    `<text x="40" y="${140 + i * 24}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
          font-size="14" fill="#1a1a1a">${escapeXml(line)}</text>`
  ).join("\n  ")}
</svg>
    `.trim();

    // Convert SVG to PNG using Sharp
    await sharp(Buffer.from(svg))
      .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)
      .png()
      .toFile(outputPath);

    console.log(`✓ Generated thumbnail: ${basename(outputPath)}`);
  } catch (error) {
    console.error(`Error generating thumbnail for ${template.title}:`, error);
    throw error;
  }
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Main function to process all templates
 */
async function main() {
  try {
    // Ensure thumbnails directory exists
    await mkdir(THUMBNAILS_DIR, { recursive: true });

    // Read all template files
    const files = await readdir(TEMPLATES_DIR);
    const templateFiles = files.filter((f) => f.endsWith(".json"));

    console.log(`Found ${templateFiles.length} template(s) to process`);

    for (const file of templateFiles) {
      const filePath = join(TEMPLATES_DIR, file);
      const fileContent = await readFile(filePath, "utf-8");
      const template: Template = JSON.parse(fileContent);

      // Generate thumbnail filename
      const templateId = basename(file, ".json");
      const thumbnailPath = join(THUMBNAILS_DIR, `${templateId}.png`);

      await generateThumbnail(template, thumbnailPath);

      // Update template metadata to include thumbnail path
      template.thumbnail = `/templates/thumbnails/${templateId}.png`;
      await writeFile(filePath, JSON.stringify(template, null, 2));
    }

    console.log("✓ All thumbnails generated successfully");
  } catch (error) {
    console.error("Error generating thumbnails:", error);
    process.exit(1);
  }
}

main();

