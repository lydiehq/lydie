/**
 * Template metadata and utilities
 * Templates are stored in the public/templates directory
 * Each template has a JSON file with metadata and content
 */

export interface DocumentTemplate {
  /**
   * Unique identifier for the template (derived from filename)
   */
  id: string;

  /**
   * Title of the template
   */
  title: string;

  /**
   * Category for organizing templates (e.g., "Getting Started", "API Documentation")
   */
  category: string;

  /**
   * Description of what this template is for
   */
  description: string;

  /**
   * Optional path to thumbnail image
   */
  thumbnail?: string;

  /**
   * The document content in TipTap JSON format
   */
  content: any;
}

/**
 * Template metadata (without the full content)
 * Used for listing templates without loading full content
 */
export interface TemplateMetadata {
  id: string;
  title: string;
  category: string;
  description: string;
  thumbnail?: string;
}

// Import metadata generated at build time
import { templateMetadata as _templateMetadata } from "./templates-metadata";

const templateMetadata: TemplateMetadata[] = _templateMetadata;

/**
 * Get all template metadata
 */
export function getTemplates(): TemplateMetadata[] {
  return templateMetadata;
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): TemplateMetadata[] {
  return templateMetadata.filter((template) => template.category === category);
}

/**
 * Get all unique categories
 */
export function getTemplateCategories(): string[] {
  const categories = new Set(templateMetadata.map((t) => t.category));
  return Array.from(categories).sort();
}

/**
 * Get a specific template by ID
 */
export function getTemplate(id: string): TemplateMetadata | undefined {
  return templateMetadata.find((template) => template.id === id);
}

