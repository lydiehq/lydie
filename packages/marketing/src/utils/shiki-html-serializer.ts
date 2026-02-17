import type { ContentNode, TextNode } from "@lydie-app/sdk";
import { HTMLSerializer } from "@lydie/core/serialization/html";
import { codeToHtml } from "shiki";

export class ShikiHTMLSerializer extends HTMLSerializer {
  private linkResolver?: (ref: {
    href: string;
    id?: string;
    slug?: string;
    title?: string;
    parentSlug?: string;
    type?: "internal" | "external";
  }) => string;

  constructor(options?: {
    linkPrefix?: string;
    linkResolver?: (ref: {
      href: string;
      id?: string;
      slug?: string;
      title?: string;
      parentSlug?: string;
      type?: "internal" | "external";
    }) => string;
  }) {
    super({ linkPrefix: options?.linkPrefix });
    this.linkResolver = options?.linkResolver;
  }

  internalLink(
    content: string,
    documentId?: string,
    documentSlug?: string,
    documentTitle?: string,
    documentParentSlug?: string,
  ): string {
    if (this.linkResolver) {
      const href = this.linkResolver({
        href: `internal://${documentId || ""}`,
        id: documentId,
        slug: documentSlug,
        title: documentTitle,
        parentSlug: documentParentSlug,
        type: "internal",
      });
      const titleAttr = documentTitle ? ` title="${this.escape(documentTitle)}"` : "";
      return `<a href="${this.escape(href)}"${titleAttr}>${content}</a>`;
    }
    // Fall back to parent implementation
    return super.internalLink(content, documentId, documentSlug, documentTitle);
  }

  codeBlock(children: string[], language?: string | null): string {
    // This will be overridden by async processing in the Astro component
    // Return placeholder that matches the structure
    const code = children.join("");
    const langAttr = language ? ` class="language-${this.escape(language)}"` : "";
    return `<div class="rounded-lg bg-gray-50 border border-gray-200 p-3 my-0 overflow-x-auto"><pre><code${langAttr}>${this.escape(
      code,
    )}</code></pre></div>`;
  }

  async codeBlockWithShiki(children: string[], language?: string | null): Promise<string> {
    const code = children.join("");

    try {
      const html = await codeToHtml(code, {
        lang: language || "text",
        theme: "github-light",
      });
      // Wrap in a container div with styling
      return `<div class="rounded-lg bg-gray-50 border border-gray-200 p-3 my-0 overflow-x-auto [&_pre]:bg-transparent! [&_pre]:p-0! [&_pre]:m-0! [&_pre]:border-0! [&_pre]:overflow-x-auto!">${html}</div>`;
    } catch (error) {
      console.warn("[ShikiHTMLSerializer] Error highlighting code:", error);
      // Fallback to plain code
      const langAttr = language ? ` class="language-${this.escape(language)}"` : "";
      return `<div class="rounded-lg bg-gray-50 border border-gray-200 p-3 my-0 overflow-x-auto"><pre><code${langAttr}>${this.escape(
        code,
      )}</code></pre></div>`;
    }
  }
}

// Helper function to extract code text from a codeBlock node
export function extractCodeText(node: ContentNode): string {
  if (!node.content) return "";
  return node.content
    .filter((n): n is TextNode => n.type === "text")
    .map((n) => n.text)
    .join("");
}
