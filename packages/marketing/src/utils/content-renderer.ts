import type { ContentNode } from "@lydie-app/sdk";

import type { ShikiHTMLSerializer } from "./shiki-html-serializer";

/**
 * Props for custom image component
 */
export interface ImageComponentProps {
  src: string;
  alt?: string;
  title?: string;
  width?: number | null;
  height?: number | null;
}

/**
 * Custom components that can be passed to the content renderer.
 * Similar to Streamdown's API - returns HTML strings.
 */
export interface ContentRendererComponents {
  /** Custom image renderer - receives image attributes and returns HTML string */
  image?: (props: ImageComponentProps) => string;
  /** Custom component renderers for document components - key is component name */
  linkGrid?: (props: Record<string, any>) => string;
  comparisonGrid?: (props: Record<string, any>) => string;
  visualFramework?: (props: Record<string, any>) => string;
  flowSteps?: (props: Record<string, any>) => string;
}

/**
 * Default image component that returns basic HTML img tag
 */
export function defaultImageComponent(props: ImageComponentProps): string {
  const { src, alt, title, width, height } = props;
  const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : "";
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  const widthAttr = width ? ` width="${width}"` : "";
  const heightAttr = height ? ` height="${height}"` : "";

  return `<img src="${escapeHtml(src)}"${altAttr}${titleAttr}${widthAttr}${heightAttr} />`;
}

/**
 * Styled image component for blog content with Tailwind classes
 */
export function blogImageComponent(props: ImageComponentProps): string {
  const { src, alt, title, width, height } = props;
  const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : "";
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  const widthAttr = width ? ` width="${width}"` : "";
  const heightAttr = height ? ` height="${height}"` : "";

  return `<div class="my-6 flex justify-center">
    <img
      src="${escapeHtml(src)}"
      ${altAttr}${titleAttr}${widthAttr}${heightAttr}
      class="rounded-lg border border-black/8 max-w-full h-auto"
      loading="lazy"
      decoding="async"
    />
  </div>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Result of rendering content - includes both HTML and extracted image data
 */
export interface RenderContentResult {
  /** The rendered HTML string */
  html: string;
  /** List of all images found in the content */
  images: ImageComponentProps[];
}

/**
 * Options for rendering content
 */
export interface RenderContentOptions {
  /** Custom components for rendering different node types */
  components?: ContentRendererComponents;
  /** Link prefix for internal links */
  linkPrefix?: string;
  /** Custom link resolver function */
  linkResolver?: (ref: {
    href: string;
    id?: string;
    slug?: string;
    title?: string;
    parentSlug?: string;
    collectionId?: string;
    type?: "internal" | "external";
  }) => string;
}

export async function renderContent(
  content: ContentNode,
  options: RenderContentOptions = {},
): Promise<RenderContentResult> {
  const { components = {}, linkPrefix, linkResolver } = options;
  const images: ImageComponentProps[] = [];

  // Use custom image component or default
  const imageComponent = components.image || defaultImageComponent;

  // Dynamic import to avoid circular dependencies
  const { ShikiHTMLSerializer, extractCodeText } = await import("./shiki-html-serializer");
  const serializer = new ShikiHTMLSerializer({ linkPrefix, linkResolver });

  async function renderNode(n: ContentNode | any): Promise<string> {
    if (n.type === "text") {
      return renderMarks(n.text, n.marks, serializer);
    }

    // Handle images - render inline using custom component
    if (n.type === "image") {
      const src = n.attrs?.src;
      if (typeof src === "string") {
        const imageProps: ImageComponentProps = {
          src,
          alt: n.attrs?.alt,
          title: n.attrs?.title,
          width: n.attrs?.width,
          height: n.attrs?.height,
        };

        // Track image for potential optimization
        images.push(imageProps);

        // Render inline using custom component
        return imageComponent(imageProps);
      }
      return "";
    }

    if (!n.content || !Array.isArray(n.content)) {
      return "";
    }

    // Render children
    const childHtmls = await Promise.all(
      n.content.map((child: ContentNode | any) => renderNode(child)),
    );

    // Render this node with its children
    switch (n.type) {
      case "doc":
        return serializer.doc(childHtmls);
      case "paragraph":
        return serializer.paragraph(childHtmls);
      case "heading":
        return serializer.heading(n.attrs?.level || 1, childHtmls);
      case "bulletList":
        return serializer.bulletList(childHtmls);
      case "orderedList":
        return serializer.orderedList(childHtmls, n.attrs?.start);
      case "listItem":
        return serializer.listItem(childHtmls);
      case "horizontalRule":
        return serializer.horizontalRule();
      case "blockquote":
        return serializer.blockquote(childHtmls);
      case "codeBlock": {
        const rawCode = extractCodeText(n);
        return await serializer.codeBlockWithShiki([rawCode], n.attrs?.language);
      }
      case "customBlock":
      case "documentComponent": {
        const componentName = n.attrs?.name || "";
        const properties = n.attrs?.properties || {};

        // Check if we have a custom renderer for this component
        const componentRenderer = (
          components as Record<string, (props: Record<string, any>) => string | undefined>
        )[componentName];
        if (componentRenderer) {
          const result = componentRenderer(properties);
          if (result) return result;
        }

        // Fall back to default serializer
        return serializer.customBlock(componentName, properties);
      }
      case "table":
        return serializer.table(childHtmls);
      case "tableRow":
        return serializer.tableRow(childHtmls);
      case "tableHeader":
        return serializer.tableHeader(childHtmls, n.attrs?.colspan, n.attrs?.rowspan);
      case "tableCell":
        return serializer.tableCell(childHtmls, n.attrs?.colspan, n.attrs?.rowspan);
      default:
        return "";
    }
  }

  const html = await renderNode(content);

  return { html, images };
}

// Handle marks (bold, italic, links, etc.)
function renderMarks(
  text: string,
  marks: any[] | undefined,
  serializer: ShikiHTMLSerializer,
): string {
  if (!marks || marks.length === 0) {
    return serializer.text(text);
  }

  return marks.reduce((wrapped: string, mark) => {
    if (!mark || typeof mark !== "object" || !mark.type) {
      return wrapped;
    }

    switch (mark.type) {
      case "bold":
        return serializer.bold(wrapped);
      case "italic":
        return serializer.italic(wrapped);
      case "link":
        return serializer.link(wrapped, mark.attrs?.href, mark.attrs?.rel, mark.attrs?.target);
      case "internal-link":
        return serializer.internalLink(
          wrapped,
          mark.attrs?.["document-id"],
          mark.attrs?.["document-slug"],
          mark.attrs?.["document-title"],
          mark.attrs?.["document-parent-slug"],
          mark.attrs?.["document-collection-id"],
        );
      default:
        return wrapped;
    }
  }, serializer.text(text));
}
