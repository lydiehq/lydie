/**
 * Plain text serializer for TipTap content
 * Serializes TipTap JSON to plain text format
 * Implements the ContentBuilder interface to convert TipTap JSON to plain text
 */

import type { ContentBuilder } from "../content";

/**
 * Plain Text Serializer - generates plain text strings from TipTap content
 * Strips all formatting and structure, keeping only text content
 */
export class PlainTextSerializer implements ContentBuilder<string> {
  text(content: string): string {
    return content;
  }

  bold(content: string): string {
    return content;
  }

  italic(content: string): string {
    return content;
  }

  link(
    content: string,
    _href?: string,
    _rel?: string,
    _target?: string
  ): string {
    return content;
  }

  doc(children: string[]): string {
    return children.join("\n\n").trim();
  }

  paragraph(children: string[]): string {
    return children.join("");
  }

  heading(_level: number, children: string[]): string {
    return children.join("");
  }

  bulletList(children: string[]): string {
    return children.join("\n");
  }

  orderedList(children: string[], _start?: number): string {
    return children.join("\n");
  }

  listItem(children: string[]): string {
    return children.join("\n");
  }

  horizontalRule(): string {
    return "---";
  }

  customBlock(_name: string, _properties: Record<string, any>): string {
    // Custom blocks are omitted in plain text
    return "";
  }

  fragment(children: string[]): string {
    return children.join("");
  }

  empty(): string {
    return "";
  }

  escape(text: string): string {
    return text;
  }
}

// For backwards compatibility
export { PlainTextSerializer as PlainTextBuilder };

