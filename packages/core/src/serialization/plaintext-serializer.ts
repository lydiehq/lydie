import type { NodeBuilder } from "../content"

export class PlainTextSerializer implements NodeBuilder<string> {
  text(content: string): string {
    return content
  }

  bold(content: string): string {
    return content
  }

  italic(content: string): string {
    return content
  }

  link(content: string, _href?: string, _rel?: string, _target?: string): string {
    return content
  }

  doc(children: string[]): string {
    return children.join("\n\n").trim()
  }

  paragraph(children: string[]): string {
    return children.join("")
  }

  heading(_level: number, children: string[]): string {
    return children.join("")
  }

  bulletList(children: string[]): string {
    return children.join("\n")
  }

  orderedList(children: string[], _start?: number): string {
    return children.join("\n")
  }

  listItem(children: string[]): string {
    return children.join("\n")
  }

  blockquote(children: string[]): string {
    return children.join("")
  }

  horizontalRule(): string {
    return "---"
  }

  codeBlock(children: string[], _language?: string | null): string {
    return children.join("")
  }

  customBlock(_name: string, _properties: Record<string, any>): string {
    // Custom blocks are omitted in plain text
    return ""
  }

  fragment(children: string[]): string {
    return children.join("")
  }

  empty(): string {
    return ""
  }

  escape(text: string): string {
    return text
  }
}

// For backwards compatibility
export { PlainTextSerializer as PlainTextBuilder }
