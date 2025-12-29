import React from "react";
import {
  ContentNode,
  CustomBlockProps,
  TocItem,
  Document,
  NodeBuilder,
  renderWithBuilder,
  extractTableOfContents,
} from "@lydie/core/content";

export interface UseLydieDocumentConfig {
  apiKey: string;
  organizationId: string;
  apiUrl?: string;
  debug?: boolean;
  include?: {
    related?: boolean;
    toc?: boolean;
  };
  links?: {
    transform?: boolean;
    useIds?: boolean;
  };
}

export interface UseLydieDocumentReturn {
  document: Document | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useLydieDocument(
  slug: string,
  config: UseLydieDocumentConfig
): UseLydieDocumentReturn {
  const [document, setDocument] = React.useState<Document | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const fetchDocument = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (config.include?.related) {
        params.set("include_related", "true");
      }
      if (config.include?.toc) {
        params.set("include_toc", "true");
      }
      if (config.links?.transform === false) {
        params.set("transform_links", "false");
      }
      if (config.links?.useIds) {
        params.set("use_ids", "true");
      }

      const url = `${config.apiUrl || "https://api.lydie.co/v1"}/${
        config.organizationId
      }/documents/${slug}${params.toString() ? `?${params.toString()}` : ""}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.statusText}`);
      }

      const doc = await response.json();
      setDocument(doc);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, [slug, config]);

  React.useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  return {
    document,
    loading,
    error,
    refresh: fetchDocument,
  };
}

// React Builder for rendering document nodes
export class ReactBuilder implements NodeBuilder<React.ReactNode> {
  private customComponents?: Record<
    string,
    React.ComponentType<CustomBlockProps>
  >;
  private linkPrefix?: string;
  private linkResolver?: (ref: {
    href: string;
    id?: string;
    slug?: string;
    type?: "internal" | "external";
  }) => string;

  constructor(
    customComponents?: Record<string, React.ComponentType<CustomBlockProps>>,
    options?: {
      linkPrefix?: string;
      linkResolver?: (ref: {
        href: string;
        id?: string;
        slug?: string;
        type?: "internal" | "external";
      }) => string;
    }
  ) {
    this.customComponents = customComponents;
    this.linkPrefix = options?.linkPrefix;
    this.linkResolver = options?.linkResolver;
  }

  text(content: string): React.ReactNode {
    return content;
  }

  bold(content: React.ReactNode): React.ReactNode {
    return <strong key={Math.random()}>{content}</strong>;
  }

  italic(content: React.ReactNode): React.ReactNode {
    return <em key={Math.random()}>{content}</em>;
  }

  link(
    content: React.ReactNode,
    href?: string,
    rel?: string,
    target?: string
  ): React.ReactNode {
    let finalHref = href;

    // If linkResolver is provided, use it to resolve internal:// links
    if (this.linkResolver && href?.startsWith("internal://")) {
      const documentId = href.replace("internal://", "");
      finalHref = this.linkResolver({
        href,
        id: documentId,
        type: "internal",
      });
    }
    // Otherwise, apply link prefix if provided and href is a relative path
    else if (
      this.linkPrefix &&
      href &&
      !href.startsWith("http") &&
      !href.startsWith("mailto:") &&
      !href.startsWith("tel:") &&
      !href.startsWith("internal://")
    ) {
      // Only prefix relative paths (not absolute URLs or protocols)
      finalHref = `${this.linkPrefix}${
        href.startsWith("/") ? href : `/${href}`
      }`;
    }

    return (
      <a key={Math.random()} href={finalHref} rel={rel} target={target}>
        {content}
      </a>
    );
  }

  doc(children: React.ReactNode[]): React.ReactNode {
    return <div>{this.fragment(children)}</div>;
  }

  paragraph(children: React.ReactNode[]): React.ReactNode {
    return <p key={Math.random()}>{this.fragment(children)}</p>;
  }

  heading(level: number, children: React.ReactNode[]): React.ReactNode {
    const safeLevel = level >= 1 && level <= 6 ? level : 1;
    const HeadingTag = `h${safeLevel}` as keyof React.JSX.IntrinsicElements;
    return (
      <HeadingTag key={Math.random()}>{this.fragment(children)}</HeadingTag>
    );
  }

  bulletList(children: React.ReactNode[]): React.ReactNode {
    return <ul key={Math.random()}>{this.fragment(children)}</ul>;
  }

  orderedList(children: React.ReactNode[], start?: number): React.ReactNode {
    return (
      <ol key={Math.random()} start={start}>
        {this.fragment(children)}
      </ol>
    );
  }

  listItem(children: React.ReactNode[]): React.ReactNode {
    return <li key={Math.random()}>{this.fragment(children)}</li>;
  }

  horizontalRule(): React.ReactNode {
    return <hr key={Math.random()} />;
  }

  customBlock(name: string, properties: Record<string, any>): React.ReactNode {
    if (this.customComponents && this.customComponents[name]) {
      try {
        const CustomComponent = this.customComponents[name];
        return <CustomComponent key={Math.random()} properties={properties} />;
      } catch (error) {
        console.warn(
          `[Lydie] Error rendering custom component "${name}":`,
          error
        );
        return null;
      }
    }
    return null;
  }

  fragment(children: React.ReactNode[]): React.ReactNode {
    return (
      <>
        {children.map((child, i) => (
          <React.Fragment key={i}>{child}</React.Fragment>
        ))}
      </>
    );
  }

  empty(): React.ReactNode {
    return null;
  }

  escape(text: string): string {
    // React handles escaping automatically
    return text;
  }
}

/**
 * Render content to React elements
 */
export function renderContentToReact(
  content: ContentNode,
  customComponents?: Record<string, React.ComponentType<CustomBlockProps>>,
  options?: {
    linkPrefix?: string;
    linkResolver?: (ref: {
      href: string;
      id?: string;
      slug?: string;
      type?: "internal" | "external";
    }) => string;
  }
): React.ReactNode {
  const builder = new ReactBuilder(customComponents, options);
  return renderWithBuilder(content, builder);
}

// React component for rendering content
export interface LydieContentProps {
  content: ContentNode;
  components?: Record<string, React.ComponentType<CustomBlockProps>>;
  linkPrefix?: string;
  linkResolver?: (ref: {
    href: string;
    id?: string;
    slug?: string;
    type?: "internal" | "external";
  }) => string;
}

export function LydieContent({
  content,
  components,
  linkPrefix,
  linkResolver,
}: LydieContentProps) {
  return (
    <>{renderContentToReact(content, components, { linkPrefix, linkResolver })}</>
  );
}

// Re-export utility functions
export { extractTableOfContents } from "./core";
export type { CustomBlockProps, TocItem };
