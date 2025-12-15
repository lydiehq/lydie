/**
 * Markdown serializer for TipTap content
 * Serializes TipTap JSON to Markdown format
 * Implements the ContentBuilder interface to convert TipTap JSON to Markdown
 */

import type { ContentBuilder } from "../content";

/**
 * Markdown Serializer - generates Markdown strings from TipTap content
 */
export class MarkdownSerializer implements ContentBuilder<string> {
  text(content: string): string {
    return this.escape(content);
  }

  bold(content: string): string {
    return `**${content}**`;
  }

  italic(content: string): string {
    return `*${content}*`;
  }

  link(content: string, href?: string, _rel?: string, _target?: string): string {
    if (!href) {
      return content;
    }
    return `[${content}](${href})`;
  }

  doc(children: string[]): string {
    return children.join("\n\n").trim();
  }

  paragraph(children: string[]): string {
    return children.join("");
  }

  heading(level: number, children: string[]): string {
    const safeLevel = level >= 1 && level <= 6 ? level : 1;
    const hashes = "#".repeat(safeLevel);
    return `${hashes} ${children.join("")}`;
  }

  bulletList(children: string[]): string {
    return children.join("\n");
  }

  orderedList(children: string[], start?: number): string {
    const startNum = start ?? 1;
    return children
      .map((item, index) => {
        // Replace the default bullet with the correct number
        return item.replace(/^- /, `${startNum + index}. `);
      })
      .join("\n");
  }

  listItem(children: string[]): string {
    const content = children.join("\n");
    // Handle nested lists by indenting
    const lines = content.split("\n");
    const firstLine = lines[0];
    const restLines = lines.slice(1).map((line) => `  ${line}`);
    return `- ${firstLine}${restLines.length > 0 ? "\n" + restLines.join("\n") : ""}`;
  }

  horizontalRule(): string {
    return "---";
  }

  customBlock(name: string, properties: Record<string, any>): string {
    // Convert custom blocks to JSX-style components for MDX compatibility
    const propsString = Object.entries(properties)
      .map(([key, value]) => {
        if (typeof value === "string") {
          return `${key}="${this.escapeAttribute(value)}"`;
        }
        return `${key}={${JSON.stringify(value)}}`;
      })
      .join(" ");
    
    return `<${name}${propsString ? " " + propsString : ""} />`;
  }

  fragment(children: string[]): string {
    return children.join("");
  }

  empty(): string {
    return "";
  }

  escape(text: string): string {
    // Minimal escaping for Markdown - only escape characters that would conflict with syntax
    // Note: We don't aggressively escape everything because:
    // 1. The marks (bold/italic/link) provide context that prevents ambiguity
    // 2. Over-escaping makes the Markdown harder to read
    // 3. Most markdown parsers handle literal characters well within marked sections
    return text
      .replace(/\\/g, "\\\\") // Backslash must be escaped
      .replace(/\[/g, "\\[")  // Opening bracket (for links)
      .replace(/\]/g, "\\]"); // Closing bracket (for links)
  }

  private escapeAttribute(text: string): string {
    return text.replace(/"/g, '\\"');
  }
}

// For backwards compatibility
export { MarkdownSerializer as MarkdownBuilder };

