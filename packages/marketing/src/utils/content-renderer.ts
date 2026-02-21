import { createHeadingIdGenerator } from "@lydie/core/heading-ids";
import type { ContentNode } from "@lydie/core/content";

import { extractCodeText, ShikiHTMLSerializer } from "./shiki-html-serializer";

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
  PillarCallout?: (props: Record<string, unknown>) => string;
  pillarCallout?: (props: Record<string, unknown>) => string;
  flowchart?: (props: Record<string, unknown>) => string;
  faq?: (props: Record<string, unknown>) => string;
  FAQ?: (props: Record<string, unknown>) => string;
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
    parentId?: string;
    parentSlug?: string;
    collectionHandle?: string;
    type?: "internal" | "external";
  }) => string;
}

export async function renderContent(
  content: ContentNode,
  options: RenderContentOptions = {},
): Promise<RenderContentResult> {
  const { components = {}, linkPrefix, linkResolver } = options;
  const images: ImageComponentProps[] = [];
  const nextHeadingId = createHeadingIdGenerator();

  // Use custom image component or default
  const imageComponent = components.image || defaultImageComponent;

  // Dynamic import to avoid circular dependencies
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

    const childContent = Array.isArray(n.content) ? n.content : [];

    // Render children
    const childHtmls = await Promise.all(
      childContent.map((child: ContentNode | any) => renderNode(child)),
    );

    // Render this node with its children
    switch (n.type) {
      case "doc":
        return serializer.doc(childHtmls);
      case "paragraph":
        return serializer.paragraph(childHtmls);
      case "heading": {
        const level =
          typeof n.attrs?.level === "number" && n.attrs.level >= 1 && n.attrs.level <= 6
            ? n.attrs.level
            : 1;
        const headingText = childHtmls
          .join("")
          .replace(/<[^>]*>/g, " ")
          .trim();
        const headingId = nextHeadingId(headingText);
        return (
          `<h${level} id="${headingId}" data-copy-heading class="group/heading relative scroll-mt-28">` +
          `<span>${childHtmls.join("")}</span>` +
          `<a href="#${headingId}" data-copy-heading-link aria-label="Copy link to this heading" class="ml-2 inline-flex size-6 align-middle items-center justify-center rounded text-gray-400 opacity-0 transition hover:bg-gray-100 hover:text-blue-600 group-hover/heading:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40">` +
          `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" role="img" focusable="false" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
          `<path d="M9.30558 10.206C9.57224 10.4726 9.59447 10.8912 9.37225 11.1831L9.30558 11.2594L6.84751 13.7175C5.58692 14.9781 3.54311 14.9781 2.28252 13.7175C1.0654 12.5004 1.02344 10.5531 2.15661 9.28564L2.28252 9.15251L4.74059 6.69443C5.0315 6.40353 5.50315 6.40353 5.79405 6.69443C6.06071 6.9611 6.08294 7.37963 5.86072 7.67161L5.79405 7.74789L3.33598 10.206C2.6572 10.8847 2.6572 11.9853 3.33598 12.664C3.98082 13.3089 5.00628 13.3411 5.68918 12.7608L5.79405 12.664L8.25212 10.206C8.54303 9.91506 9.01468 9.91506 9.30558 10.206ZM9.82982 6.17019C10.1207 6.46109 10.1207 6.93274 9.82982 7.22365L7.34921 9.70427C7.0583 9.99518 6.58665 9.99518 6.29575 9.70427C6.00484 9.41337 6.00484 8.94172 6.29575 8.65081L8.77637 6.17019C9.06727 5.87928 9.53892 5.87928 9.82982 6.17019ZM13.7175 2.2825C14.9346 3.49962 14.9766 5.44688 13.8434 6.71436L13.7175 6.84749L11.2594 9.30557C10.9685 9.59647 10.4969 9.59647 10.206 9.30557C9.93931 9.03891 9.91709 8.62037 10.1393 8.32839L10.206 8.25211L12.664 5.79403C13.3428 5.11525 13.3428 4.01474 12.664 3.33596C12.0192 2.69112 10.9938 2.65888 10.3109 3.23923L10.206 3.33596L7.74791 5.79403C7.457 6.08494 6.98535 6.08494 6.69445 5.79403C6.42779 5.52737 6.40556 5.10883 6.62778 4.81686L6.69445 4.74057L9.15252 2.2825C10.4131 1.02191 12.4569 1.02191 13.7175 2.2825Z"></path>` +
          `</svg>` +
          `</a>` +
          `</h${level}>`
        );
      }
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
        const componentName = typeof n.attrs?.name === "string" ? n.attrs.name.trim() : "";
        const properties = n.attrs?.properties || {};

        // Check if we have a custom renderer for this component
        const componentRegistry = components as Record<
          string,
          (props: Record<string, any>) => string | undefined
        >;
        const normalizedName = normalizeComponentKey(componentName);
        const componentRenderer =
          componentRegistry[componentName] ||
          Object.entries(componentRegistry).find(
            ([key]) => normalizeComponentKey(key) === normalizedName,
          )?.[1];
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
          mark.attrs?.["document-parent-id"] ?? mark.attrs?.["document-parent-slug"],
          mark.attrs?.["document-collection-handle"] ?? mark.attrs?.["document-collection-id"],
        );
      default:
        return wrapped;
    }
  }, serializer.text(text));
}

function normalizeComponentKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
