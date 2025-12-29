// Core content types and utilities without React dependencies
// This module contains shared functionality used across packages

// ============================================================================
// Types
// ============================================================================

export interface CustomBlockProps {
  properties: Record<string, any>;
  [key: string]: any;
}

export interface RelatedDocument {
  id: string;
  title: string;
  slug: string;
  similarity: number;
  createdAt: string;
  updatedAt: string;
}

export interface TocItem {
  id: string;
  level: number;
  text: string;
}

export interface Document {
  id: string;
  title: string;
  slug: string;
  jsonContent: ContentNode;
  userId: string;
  folderId: string | null;
  organizationId: string;
  indexStatus: string;
  published: boolean;
  lastIndexedTitle: string | null;
  lastIndexedContentHash: string | null;
  createdAt: string;
  updatedAt: string;
  path: string;
  fullPath: string;
  related?: RelatedDocument[];
  toc?: TocItem[];
  linkMetadata?: Record<string, { id: string; slug: string; title: string }>;
}

export interface LinkReference {
  href: string;
  id?: string;
  slug?: string;
  title?: string;
  type?: "internal" | "external";
}

export type LinkResolver = (ref: LinkReference) => string;

export interface DocumentListItem {
  id: string;
  title: string;
  slug: string;
  path: string;
  fullPath: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentNode {
  type: string;
  attrs?: {
    level?: number;
    start?: number;
    tight?: boolean;
    name?: string;
    properties?: Record<string, any>;
  };
  content?: (ContentNode | TextNode)[];
}

export interface TextNode {
  type: "text";
  text: string;
  marks?: Mark[];
}

export interface Mark {
  type: string;
  attrs?: {
    href?: string;
    rel?: string;
    target?: string;
    class?: string | null;
  };
}

// ============================================================================
// Node Builder Interface
// ============================================================================

/**
 * Generic builder interface for different output formats (HTML, React, Vue, etc.)
 */
export interface NodeBuilder<T> {
  // Text and marks
  text(content: string): T;
  bold(content: T): T;
  italic(content: T): T;
  link(content: T, href?: string, rel?: string, target?: string): T;

  // Block elements
  doc(children: T[]): T;
  paragraph(children: T[]): T;
  heading(level: number, children: T[]): T;
  bulletList(children: T[]): T;
  orderedList(children: T[], start?: number): T;
  listItem(children: T[]): T;
  horizontalRule(): T;

  // Custom blocks
  customBlock(name: string, properties: Record<string, any>): T;

  // Utilities
  fragment(children: T[]): T;
  empty(): T;
  escape(text: string): string;
}

// ============================================================================
// Re-export HTML Builder for backwards compatibility
// ============================================================================

export { HTMLBuilder } from "./serialization/html";

// ============================================================================
// Core rendering engine
// ============================================================================

export function renderWithBuilder<T>(
  content: ContentNode,
  builder: NodeBuilder<T>
): T {
  const renderMarks = (text: string, marks?: Mark[]): T => {
    if (!marks || marks.length === 0) {
      return builder.text(text);
    }

    try {
      return marks.reduce((wrapped: T, mark) => {
        if (!mark || typeof mark !== "object" || !mark.type) {
          return wrapped;
        }

        switch (mark.type) {
          case "bold":
            return builder.bold(wrapped);
          case "italic":
            return builder.italic(wrapped);
          case "link":
            return builder.link(
              wrapped,
              mark.attrs?.href,
              mark.attrs?.rel,
              mark.attrs?.target
            );
          default:
            return wrapped;
        }
      }, builder.text(text));
    } catch (error) {
      console.warn("[Lydie] Error rendering marks:", error);
      return builder.text(text);
    }
  };

  const renderNode = (node: ContentNode | TextNode): T => {
    try {
      // Validate node structure
      if (!node || typeof node !== "object" || !node.type) {
        return builder.empty();
      }

      if (node.type === "text") {
        const textNode = node as TextNode;
        if (typeof textNode.text !== "string") {
          return builder.empty();
        }
        return renderMarks(textNode.text, textNode.marks);
      }

      const renderChildren = (node: ContentNode): T[] => {
        if (!Array.isArray(node.content)) return [];
        return node.content
          .map(renderNode)
          .filter((child) => child != null) as T[];
      };

      switch (node.type) {
        case "doc":
          return builder.doc(renderChildren(node));

        case "paragraph":
          return builder.paragraph(renderChildren(node));

        case "heading":
          const level = node.attrs?.level || 1;
          return builder.heading(level, renderChildren(node));

        case "bulletList":
          return builder.bulletList(renderChildren(node));

        case "orderedList":
          const start = node.attrs?.start;
          return builder.orderedList(renderChildren(node), start);

        case "listItem":
          return builder.listItem(renderChildren(node));

        case "horizontalRule":
          return builder.horizontalRule();

        case "customBlock":
          const componentName = node.attrs?.name;
          if (componentName && typeof componentName === "string") {
            return builder.customBlock(
              componentName,
              node.attrs?.properties || {}
            );
          }
          return builder.empty();

        case "documentComponent": {
          const componentName = node.attrs?.name;
          if (componentName && typeof componentName === "string") {
            return builder.customBlock(
              componentName,
              node.attrs?.properties || {}
            );
          }
          return builder.empty();
        }

        default:
          console.warn(`[Lydie] Unknown content node type: ${node.type}`);
          return builder.empty();
      }
    } catch (error) {
      console.warn("[Lydie] Error rendering node:", error);
      return builder.empty();
    }
  };

  return renderNode(content);
}

// ============================================================================
// HTML Rendering (Re-export for backwards compatibility)
// ============================================================================

export { serializeToHTML } from "./serialization/html";

// ============================================================================
// API Client
// ============================================================================

// API Client for server-side operations
export class LydieClient {
  private apiKey: string;
  private apiUrl: string;
  private debug: boolean;
  private organizationId: string;

  constructor(config: {
    apiKey: string;
    apiUrl?: string;
    debug?: boolean;
    organizationId: string;
  }) {
    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl || "https://api.lydie.co/v1";
    this.debug = config.debug || false;
    this.organizationId = config.organizationId;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private getBaseUrl(): string {
    return `${this.apiUrl}/${this.organizationId}`;
  }

  async getDocuments(): Promise<{ documents: DocumentListItem[] }> {
    try {
      const url = `${this.getBaseUrl()}/documents`;

      if (this.debug) {
        console.log(`[Lydie] Fetching documents from url: ${url}`);
        console.log(`[Lydie] Using headers:`, this.getHeaders());
      }

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (this.debug) {
        console.log(
          `[Lydie] Documents fetch response status: ${response.status} ${response.statusText}`
        );
      }

      if (!response.ok) {
        throw new Error(
          `[Lydie] Failed to fetch documents: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { documents: DocumentListItem[] };

      if (this.debug) {
        console.log(
          `[Lydie] Successfully fetched ${data.documents.length} documents`
        );
      }

      return data;
    } catch (error) {
      if (this.debug) {
        console.error("[Lydie] Error fetching documents:", error);
      }
      throw error;
    }
  }

  async getDocument(
    slug: string,
    options?: {
      related?: boolean;
      toc?: boolean;
      transformLinks?: boolean;
      useIds?: boolean;
      linkMetadata?: boolean;
    }
  ): Promise<Document> {
    try {
      const params = new URLSearchParams();
      if (options?.related) {
        params.set("include_related", "true");
      }
      if (options?.toc) {
        params.set("include_toc", "true");
      }
      if (options?.transformLinks === false) {
        params.set("transform_links", "false");
      }
      if (options?.useIds) {
        params.set("use_ids", "true");
      }
      if (options?.linkMetadata) {
        params.set("include_link_metadata", "true");
      }

      const url = `${this.getBaseUrl()}/documents/${slug}${
        params.toString() ? `?${params.toString()}` : ""
      }`;

      if (this.debug) {
        console.log(`[Lydie] Fetching document from url: ${url}`);
        console.log(`[Lydie] Using headers:`, this.getHeaders());
        if (options?.related) {
          console.log(`[Lydie] Including related documents`);
        }
        if (options?.toc) {
          console.log(`[Lydie] Including table of contents`);
        }
        if (options?.transformLinks === false) {
          console.log(`[Lydie] Link transformation disabled`);
        }
        if (options?.useIds) {
          console.log(`[Lydie] Using document IDs in links`);
        }
      }

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (this.debug) {
        console.log(
          `[Lydie] Document fetch response status: ${response.status} ${response.statusText}`
        );
      }

      if (!response.ok) {
        throw new Error(
          `[Lydie] Failed to fetch document ${slug}: ${response.statusText}`
        );
      }

      const document = (await response.json()) as Document;

      if (this.debug) {
        console.log(
          `[Lydie] Successfully fetched document: ${document.title} (${document.slug})`
        );
        if (document.related) {
          console.log(
            `[Lydie] Found ${document.related.length} related documents`
          );
        }
      }

      return document;
    } catch (error) {
      if (this.debug) {
        console.error(`[Lydie] Error fetching document ${slug}:`, error);
      }
      throw error;
    }
  }

  async getDocumentByPath(
    path: string,
    options?: {
      related?: boolean;
      toc?: boolean;
      transformLinks?: boolean;
      useIds?: boolean;
      linkMetadata?: boolean;
    }
  ): Promise<Document> {
    try {
      const params = new URLSearchParams();
      if (options?.related) {
        params.set("include_related", "true");
      }
      if (options?.toc) {
        params.set("include_toc", "true");
      }
      if (options?.transformLinks === false) {
        params.set("transform_links", "false");
      }
      if (options?.useIds) {
        params.set("use_ids", "true");
      }
      if (options?.linkMetadata) {
        params.set("include_link_metadata", "true");
      }

      const url = `${this.getBaseUrl()}/documents/by-path/${path}${
        params.toString() ? `?${params.toString()}` : ""
      }`;

      if (this.debug) {
        console.log(`[Lydie] Fetching document by path from url: ${url}`);
        console.log(`[Lydie] Using headers:`, this.getHeaders());
        if (options?.transformLinks === false) {
          console.log(`[Lydie] Link transformation disabled`);
        }
        if (options?.useIds) {
          console.log(`[Lydie] Using document IDs in links`);
        }
        if (options?.linkMetadata) {
          console.log(`[Lydie] Including link metadata for frontend resolution`);
        }
      }

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (this.debug) {
        console.log(
          `[Lydie] Document by path fetch response status: ${response.status} ${response.statusText}`
        );
      }

      if (!response.ok) {
        throw new Error(
          `[Lydie] Failed to fetch document at path ${path}: ${response.statusText}`
        );
      }

      const document = (await response.json()) as Document;

      if (this.debug) {
        console.log(
          `[Lydie] Successfully fetched document by path: ${document.title} (${document.fullPath})`
        );
      }

      return document;
    } catch (error) {
      if (this.debug) {
        console.error(
          `[Lydie] Error fetching document by path ${path}:`,
          error
        );
      }
      throw error;
    }
  }

  async getFolders(): Promise<{ folders: Folder[] }> {
    try {
      const url = `${this.getBaseUrl()}/folders`;

      if (this.debug) {
        console.log(`[Lydie] Fetching folders from url: ${url}`);
        console.log(`[Lydie] Using headers:`, this.getHeaders());
      }

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (this.debug) {
        console.log(
          `[Lydie] Folders fetch response status: ${response.status} ${response.statusText}`
        );
      }

      if (!response.ok) {
        throw new Error(
          `[Lydie] Failed to fetch folders: ${response.statusText}`
        );
      }

      const data = (await response.json()) as { folders: Folder[] };

      if (this.debug) {
        console.log(
          `[Lydie] Successfully fetched ${data.folders.length} folders`
        );
      }

      return data;
    } catch (error) {
      if (this.debug) {
        console.error("[Lydie] Error fetching folders:", error);
      }
      throw error;
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

// Utility function to extract TOC from content
export function extractTableOfContents(content: ContentNode): TocItem[] {
  const headings: TocItem[] = [];
  let headingCounter = 0;

  const traverseNode = (node: ContentNode | TextNode) => {
    if (node.type === "heading") {
      const level = node.attrs?.level || 1;
      const text = extractTextFromNode(node);
      if (text.trim()) {
        headings.push({
          id: `heading-${headingCounter++}`,
          level,
          text: text.trim(),
        });
      }
    }

    if ("content" in node && node.content) {
      node.content.forEach(traverseNode);
    }
  };

  traverseNode(content);
  return headings;
}

// Helper function to extract text content from a node
function extractTextFromNode(node: ContentNode | TextNode): string {
  if (node.type === "text") {
    return (node as TextNode).text;
  }

  if ("content" in node && node.content) {
    return node.content.map(extractTextFromNode).join("");
  }

  return "";
}

/**
 * Extract plain text from content node
 */
export function extractText(content: ContentNode): string {
  return extractTextFromNode(content);
}
