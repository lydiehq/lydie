/**
 * Field definition for module/database schemas
 */
export type FieldDefinition = {
  field: string;
  type: "text" | "datetime" | "select" | "file" | "boolean";
  required: boolean;
  options?: string[]; // for 'select' only
};

/**
 * Module configuration stored in document.module_config
 */
export type ModuleConfig = {
  urlPrefix: string; // e.g. '/blog', '/resources'
  slugMode: "flat" | "hierarchical";
  sidebarVisibility: "always" | "never";
  llmContextBounded: boolean;
  schema: FieldDefinition[];
};

/**
 * Module types supported by the system
 */
export type ModuleType = "blog" | "wiki" | null;

/**
 * Document properties - stored directly on documents that belong to a module
 * This replaces the separate records table for tighter coupling
 */
export type DocumentProperties = Record<string, string | number | boolean | null>;

/**
 * Internal link node structure stored in TipTap content
 */
export type InternalLinkNode = {
  type: "internal";
  documentId: string;
  moduleId: string; // denormalized at insertion time
  slug: string; // denormalized at insertion time
};

/**
 * First-party module configurations
 */
export const BLOG_MODULE_CONFIG: ModuleConfig = {
  urlPrefix: "/blog",
  slugMode: "flat",
  sidebarVisibility: "always",
  llmContextBounded: true,
  schema: [
    { field: "slug", type: "text", required: true },
    { field: "excerpt", type: "text", required: false },
    { field: "status", type: "select", required: true, options: ["draft", "published"] },
    { field: "publishedAt", type: "datetime", required: false },
    { field: "coverImage", type: "file", required: false },
  ],
};

export const WIKI_MODULE_CONFIG: ModuleConfig = {
  urlPrefix: "/wiki",
  slugMode: "hierarchical",
  sidebarVisibility: "always",
  llmContextBounded: true,
  schema: [
    {
      field: "visibility",
      type: "select",
      required: true,
      options: ["internal", "external", "both"],
    },
    { field: "owner", type: "text", required: false },
    { field: "lastReviewedAt", type: "datetime", required: false },
  ],
};

/**
 * Link resolver function for generating public URLs from internal links
 */
export function linkResolver(link: InternalLinkNode, moduleRoutes: Record<string, string>): string {
  const prefix = moduleRoutes[link.moduleId] ?? "";
  return `${prefix}/${link.slug}`;
}

/**
 * Resolve hierarchical slug by walking parentId chain to module root
 */
export function resolveHierarchicalSlug(
  pageId: string,
  pages: Map<string, { id: string; parentId: string | null; slug: string }>,
  moduleRootId: string,
): string {
  const segments: string[] = [];
  let current = pages.get(pageId);

  while (current && current.id !== moduleRootId) {
    segments.unshift(current.slug);
    const parent = pages.get(current.parentId ?? "");
    if (!parent) break;
    current = parent;
  }

  return segments.join("/");
}

/**
 * Compute public URL for a document based on module config
 * Now uses document.properties directly instead of separate records
 */
export function computePublicUrl(
  documentId: string,
  moduleConfig: ModuleConfig,
  properties: DocumentProperties,
  pages: Map<string, { id: string; parentId: string | null; slug: string }>,
  moduleRootId: string,
): string {
  if (moduleConfig.slugMode === "flat") {
    const slug = properties.slug as string;
    return `${moduleConfig.urlPrefix}/${slug}`;
  }

  // hierarchical mode
  const hierarchicalSlug = resolveHierarchicalSlug(documentId, pages, moduleRootId);
  return `${moduleConfig.urlPrefix}/${hierarchicalSlug}`;
}

/**
 * Get field value from document properties with type safety
 */
export function getProperty(
  properties: DocumentProperties,
  field: string,
): string | number | boolean | null {
  return properties[field] ?? null;
}

/**
 * Set field value in document properties
 */
export function setProperty(
  properties: DocumentProperties,
  field: string,
  value: string | number | boolean | null,
): DocumentProperties {
  return {
    ...properties,
    [field]: value,
  };
}

/**
 * Check if a document should be shown in sidebar based on module config
 * Documents with sidebarVisibility: 'never' should only be accessible via table view
 */
export function shouldShowInSidebar(
  document: { module_id?: string | null; id: string },
  moduleConfig?: ModuleConfig | null,
): boolean {
  // If document is not in a module, always show in sidebar
  if (!document.module_id) {
    return true;
  }

  // If document IS a module root, always show it
  if (document.id === document.module_id) {
    return true;
  }

  // For module children, check sidebar visibility setting
  if (moduleConfig) {
    return moduleConfig.sidebarVisibility === "always";
  }

  // Default to showing in sidebar if no config
  return true;
}
