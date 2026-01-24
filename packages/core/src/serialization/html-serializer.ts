import type { NodeBuilder } from "../content"

export class HTMLSerializer implements NodeBuilder<string> {
  private linkPrefix?: string

  constructor(options?: { linkPrefix?: string }) {
    this.linkPrefix = options?.linkPrefix
  }

  internalLink(content: string, documentId?: string, documentSlug?: string, documentTitle?: string): string {
    let href = documentSlug || documentId || "#"
    if (!href.startsWith("/") && !href.startsWith("http")) {
      href = `/${href}`
    }

    if (this.linkPrefix) {
      href = `${this.linkPrefix}${href}`
    }

    const titleAttr = documentTitle ? ` title="${this.escape(documentTitle)}"` : ""
    return `<a href="${this.escape(href)}"${titleAttr}>${content}</a>`
  }

  text(content: string): string {
    return this.escape(content)
  }

  bold(content: string): string {
    return `<strong>${content}</strong>`
  }

  italic(content: string): string {
    return `<em>${content}</em>`
  }

  link(content: string, href?: string, rel?: string, target?: string): string {
    let finalHref = href
    if (
      this.linkPrefix &&
      href &&
      !href.startsWith("http") &&
      !href.startsWith("mailto:") &&
      !href.startsWith("tel:")
    ) {
      finalHref = `${this.linkPrefix}${href.startsWith("/") ? href : `/${href}`}`
    }

    const hrefAttr = finalHref ? ` href="${this.escape(finalHref)}"` : ""
    const relAttr = rel ? ` rel="${this.escape(rel)}"` : ""
    const targetAttr = target ? ` target="${this.escape(target)}"` : ""
    return `<a${hrefAttr}${relAttr}${targetAttr}>${content}</a>`
  }

  doc(children: string[]): string {
    return `<div>${children.join("")}</div>`
  }

  paragraph(children: string[]): string {
    return `<p>${children.join("")}</p>`
  }

  heading(level: number, children: string[]): string {
    const safeLevel = level >= 1 && level <= 6 ? level : 1
    return `<h${safeLevel}>${children.join("")}</h${safeLevel}>`
  }

  bulletList(children: string[]): string {
    return `<ul>${children.join("")}</ul>`
  }

  orderedList(children: string[], start?: number): string {
    const startAttr = typeof start === "number" ? ` start="${start}"` : ""
    return `<ol${startAttr}>${children.join("")}</ol>`
  }

  listItem(children: string[]): string {
    return `<li>${children.join("")}</li>`
  }

  blockquote(children: string[]): string {
    return `<blockquote>${children.join("")}</blockquote>`
  }

  horizontalRule(): string {
    return "<hr>"
  }

  codeBlock(children: string[], language?: string | null): string {
    const code = children.join("")
    const langAttr = language ? ` class="language-${this.escape(language)}"` : ""
    return `<pre><code${langAttr}>${this.escape(code)}</code></pre>`
  }

  table(children: string[]): string {
    return `<table>${children.join("")}</table>`
  }

  tableRow(children: string[]): string {
    return `<tr>${children.join("")}</tr>`
  }

  tableHeader(children: string[], colspan?: number, rowspan?: number): string {
    const colspanAttr = colspan && colspan > 1 ? ` colspan="${colspan}"` : ""
    const rowspanAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : ""
    return `<th${colspanAttr}${rowspanAttr}>${children.join("")}</th>`
  }

  tableCell(children: string[], colspan?: number, rowspan?: number): string {
    const colspanAttr = colspan && colspan > 1 ? ` colspan="${colspan}"` : ""
    const rowspanAttr = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : ""
    return `<td${colspanAttr}${rowspanAttr}>${children.join("")}</td>`
  }

  customBlock(name: string, properties: Record<string, any>): string {
    return `<div class="custom-block" data-component="${this.escape(name)}" data-properties="${this.escape(
      JSON.stringify(properties),
    )}">[Custom Block: ${this.escape(name)}]</div>`
  }

  fragment(children: string[]): string {
    return children.join("")
  }

  empty(): string {
    return ""
  }

  escape(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
  }
}

// For backwards compatibility
export { HTMLSerializer as HTMLBuilder }
