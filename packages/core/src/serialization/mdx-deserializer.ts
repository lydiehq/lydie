/**
 * MDX to TipTap JSON deserializer
 * Deserializes MDX strings (Markdown with JSX components) to TipTap JSON format
 *
 * This deserializer extends the basic markdown deserializer with support for:
 * - MDX components (<Component /> or <Component>content</Component>)
 * - Frontmatter parsing
 * - Component properties
 */

export interface MDXComponent {
  name: string;
  props: Record<string, any>;
  children?: string;
}

export interface MDXDeserializeOptions {
  /**
   * Component schemas to use when deserializing components
   * Maps component names to their property schemas
   */
  componentSchemas?: Record<string, any>;
  /**
   * Whether to preserve empty paragraphs
   * @default false
   */
  preserveEmptyParagraphs?: boolean;
}

// MDX Component regex patterns
const COMPONENT_REGEX = /<(\w+)([^>]*)>(.*?)<\/\1>|<(\w+)([^>]*?)\/>/gs;
const PROP_REGEX = /(\w+)=(?:{([^}]+)}|"([^"]*)")/g;

function parseProps(propString: string): Record<string, any> {
  const props: Record<string, any> = {};
  let match;

  while ((match = PROP_REGEX.exec(propString)) !== null) {
    const [, key, jsValue, stringValue] = match;
    if (jsValue) {
      try {
        // Try to parse as JSON for objects/arrays/booleans/numbers
        props[key] = JSON.parse(jsValue);
      } catch {
        // If parsing fails, treat as string
        props[key] = jsValue;
      }
    } else {
      props[key] = stringValue;
    }
  }

  return props;
}

/**
 * Extract MDX components from content string
 * Returns the list of components and the content with components replaced by placeholders
 */
export function extractMDXComponents(content: string): {
  components: MDXComponent[];
  cleanContent: string;
} {
  const components: MDXComponent[] = [];
  let cleanContent = content;
  let match;

  while ((match = COMPONENT_REGEX.exec(content)) !== null) {
    const [fullMatch, tagName1, props1, children, tagName2, props2] = match;
    const tagName = tagName1 || tagName2;
    const propsString = props1 || props2 || "";

    const component: MDXComponent = {
      name: tagName,
      props: parseProps(propsString),
      children: children || undefined,
    };

    components.push(component);

    // Replace the component with a placeholder that we'll convert to TipTap node
    cleanContent = cleanContent.replace(
      fullMatch,
      `[COMPONENT:${components.length - 1}]`
    );
  }

  return { components, cleanContent };
}

/**
 * Deserialize MDX string to TipTap JSON
 * Handles MDX components, frontmatter, and standard markdown
 */
export function deserializeFromMDX(
  mdxContent: string,
  options: MDXDeserializeOptions = {}
): any {
  const { componentSchemas = {}, preserveEmptyParagraphs = false } = options;

  // Extract MDX components first
  const { components, cleanContent } = extractMDXComponents(mdxContent);

  const lines = cleanContent.split("\n");
  const content: any[] = [];
  let currentParagraph: any = null;
  let currentList: any = null;
  let currentListType: "bullet" | "ordered" | null = null;

  const closeList = () => {
    if (currentList) {
      content.push(currentList);
      currentList = null;
      currentListType = null;
    }
  };

  const closeParagraph = () => {
    if (currentParagraph) {
      // Only add non-empty paragraphs unless preserveEmptyParagraphs is true
      if (
        currentParagraph.content.length > 0 ||
        preserveEmptyParagraphs
      ) {
        content.push(currentParagraph);
      }
      currentParagraph = null;
    }
  };

  // Helper function to parse inline markdown (bold, italic, links)
  const parseInlineMarkdown = (text: string): any[] => {
    const textNodes: any[] = [];
    if (!text) {
      return [{ type: "text", text: "" }];
    }

    // Simple approach: split by patterns and process sequentially
    // Priority: links > bold > italic
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;

    while ((match = linkPattern.exec(text)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        const beforeText = text.substring(lastIndex, match.index);
        textNodes.push(...parseBoldItalic(beforeText));
      }

      // Add the link
      textNodes.push({
        type: "text",
        text: match[1],
        marks: [{ type: "link", attrs: { href: match[2] } }],
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last link
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex);
      textNodes.push(...parseBoldItalic(remainingText));
    }

    // Helper to parse bold and italic (bold takes priority)
    function parseBoldItalic(segment: string): any[] {
      if (!segment) return [];

      const nodes: any[] = [];
      const boldPattern = /\*\*([^*]+)\*\*/g;
      let lastIdx = 0;
      let boldMatch;

      while ((boldMatch = boldPattern.exec(segment)) !== null) {
        // Add text before bold
        if (boldMatch.index > lastIdx) {
          const beforeText = segment.substring(lastIdx, boldMatch.index);
          nodes.push(...parseItalic(beforeText));
        }

        // Add bold text
        nodes.push({
          type: "text",
          text: boldMatch[1],
          marks: [{ type: "bold" }],
        });

        lastIdx = boldMatch.index + boldMatch[0].length;
      }

      // Add remaining text
      if (lastIdx < segment.length) {
        const remaining = segment.substring(lastIdx);
        nodes.push(...parseItalic(remaining));
      }

      return nodes.length > 0 ? nodes : [{ type: "text", text: segment }];
    }

    // Helper to parse italic
    function parseItalic(segment: string): any[] {
      if (!segment) return [];

      const nodes: any[] = [];
      const italicPattern = /(?<!\*)\*([^*]+)\*(?!\*)/g;
      let lastIdx = 0;
      let italicMatch;

      while ((italicMatch = italicPattern.exec(segment)) !== null) {
        // Add text before italic
        if (italicMatch.index > lastIdx) {
          nodes.push({
            type: "text",
            text: segment.substring(lastIdx, italicMatch.index),
          });
        }

        // Add italic text
        nodes.push({
          type: "text",
          text: italicMatch[1],
          marks: [{ type: "italic" }],
        });

        lastIdx = italicMatch.index + italicMatch[0].length;
      }

      // Add remaining text
      if (lastIdx < segment.length) {
        nodes.push({
          type: "text",
          text: segment.substring(lastIdx),
        });
      }

      return nodes.length > 0 ? nodes : [{ type: "text", text: segment }];
    }

    return textNodes.length > 0 ? textNodes : [{ type: "text", text: "" }];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle headings (# ## ###)
    if (line.trim().startsWith("#")) {
      closeParagraph();
      closeList();

      const match = line.match(/^(#+)\s+(.+)$/);
      if (match) {
        const level = Math.min(match[1].length, 6);
        const text = match[2];
        content.push({
          type: "heading",
          attrs: { level },
          content: text ? parseInlineMarkdown(text) : [],
        });
      }
      continue;
    }

    // Handle horizontal rules (---)
    if (line.trim() === "---" || line.trim() === "***") {
      closeParagraph();
      closeList();
      content.push({
        type: "horizontalRule",
      });
      continue;
    }

    // Handle unordered lists (-, *, +)
    const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
    if (unorderedMatch) {
      closeParagraph();

      const listItemText = unorderedMatch[3];
      const listItem = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarkdown(listItemText),
          },
        ],
      };

      if (currentListType !== "bullet") {
        closeList();
        currentList = {
          type: "bulletList",
          content: [],
        };
        currentListType = "bullet";
      }

      currentList.content.push(listItem);
      continue;
    }

    // Handle ordered lists (1., 2., etc.)
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      closeParagraph();

      const listItemText = orderedMatch[3];
      const listItem = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineMarkdown(listItemText),
          },
        ],
      };

      if (currentListType !== "ordered") {
        closeList();
        const startNum = parseInt(orderedMatch[2]);
        currentList = {
          type: "orderedList",
          attrs: { start: startNum },
          content: [],
        };
        currentListType = "ordered";
      }

      currentList.content.push(listItem);
      continue;
    }

    // Handle component placeholders
    const componentMatch = line.match(/\[COMPONENT:(\d+)\]/);
    if (componentMatch) {
      closeParagraph();
      closeList();

      const componentIndex = parseInt(componentMatch[1]);
      const component = components[componentIndex];

      if (component) {
        // Get schema for this component
        const schema = componentSchemas[component.name] || {};

        content.push({
          type: "documentComponent",
          attrs: {
            name: component.name,
            properties: component.props,
            schemas: { [component.name]: schema },
          },
        });
      }
      continue;
    }

    // Handle empty lines
    if (line.trim() === "") {
      closeParagraph();
      closeList();
      continue;
    }

    // Handle regular text
    closeList();

    if (!currentParagraph) {
      currentParagraph = {
        type: "paragraph",
        content: [],
      };
    }

    const textNodes = parseInlineMarkdown(line);
    currentParagraph.content.push(...textNodes);
  }

  // Close any remaining open elements
  closeParagraph();
  closeList();

  // Ensure we always have at least one content node
  if (content.length === 0) {
    content.push({
      type: "paragraph",
      content: [],
    });
  }

  return {
    type: "doc",
    content,
  };
}

