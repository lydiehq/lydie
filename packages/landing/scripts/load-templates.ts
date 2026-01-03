/**
 * Build-time script to load template metadata
 * This script reads template JSON files and generates a metadata file
 * that can be imported at build time
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATES_DIR = join(__dirname, "../public/templates");
const OUTPUT_FILE = join(__dirname, "../src/utils/templates-metadata.ts");

interface Template {
  title: string;
  category: string;
  description: string;
  content: any;
  thumbnail?: string;
}

interface TemplateMetadata {
  id: string;
  title: string;
  category: string;
  description: string;
  thumbnail?: string;
}

/**
 * Main function to load templates and generate metadata
 */
async function main() {
  try {
    // Read all template files
    const files = await readdir(TEMPLATES_DIR);
    const templateFiles = files.filter((f) => f.endsWith(".json"));

    console.log(`Found ${templateFiles.length} template(s)`);

    const metadata: TemplateMetadata[] = [];

    for (const file of templateFiles) {
      const filePath = join(TEMPLATES_DIR, file);
      const fileContent = await readFile(filePath, "utf-8");
      const template: Template = JSON.parse(fileContent);

      // Generate template ID from filename
      const templateId = basename(file, ".json");

      metadata.push({
        id: templateId,
        title: template.title,
        category: template.category,
        description: template.description,
        thumbnail: template.thumbnail || `/templates/thumbnails/${templateId}.png`,
      });
    }

    // Generate TypeScript file with metadata
    const output = `/**
 * Auto-generated template metadata
 * This file is generated at build time by scripts/load-templates.ts
 * Do not edit manually
 */

import type { TemplateMetadata } from "./templates";

export const templateMetadata: TemplateMetadata[] = ${JSON.stringify(metadata, null, 2)};
`;

    await writeFile(OUTPUT_FILE, output);
    console.log(`✓ Generated template metadata: ${OUTPUT_FILE}`);
    console.log(`  - ${metadata.length} template(s) loaded`);
  } catch (error) {
    console.error("Error loading templates:", error);
    process.exit(1);
  }
}

main();

