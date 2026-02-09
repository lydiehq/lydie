import type { NodeBuilder } from "../content";

export class MarkdownSerializer implements NodeBuilder<string> {
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
        return item.replace(/^- /, `${startNum + index}. `);
      })
      .join("\n");
  }

  listItem(children: string[]): string {
    const content = children.join("\n");
    const lines = content.split("\n");
    const firstLine = lines[0];
    const restLines = lines.slice(1).map((line) => `  ${line}`);
    return `- ${firstLine}${restLines.length > 0 ? "\n" + restLines.join("\n") : ""}`;
  }

  taskList(children: string[]): string {
    return children.join("\n");
  }

  taskItem(children: string[], checked?: boolean): string {
    const content = children.join("\n");
    const lines = content.split("\n");
    const firstLine = lines[0];
    const restLines = lines.slice(1).map((line) => `  ${line}`);
    const checkbox = checked === true ? "[x]" : "[ ]";
    return `- ${checkbox} ${firstLine}${restLines.length > 0 ? "\n" + restLines.join("\n") : ""}`;
  }

  blockquote(children: string[]): string {
    const content = children.join("\n");
    return content
      .split("\n")
      .map((line) => (line.trim() ? `> ${line}` : ">"))
      .join("\n");
  }

  horizontalRule(): string {
    return "---";
  }

  codeBlock(children: string[], language?: string | null): string {
    const code = children.join("");
    const lang = language || "";
    return `\`\`\`${lang}\n${code}\n\`\`\``;
  }

  table(children: string[]): string {
    if (children.length === 0) {
      return "";
    }

    // Markdown tables need a separator row after the header row
    // We'll add it after the first row
    const rows = children.filter((row) => row.trim().length > 0);
    if (rows.length === 0) {
      return "";
    }

    // Add separator row after first row (header row)
    const result: string[] = [];
    const firstRow = rows[0];
    if (!firstRow) {
      return "";
    }
    result.push(firstRow);

    // Create separator row based on first row's column count
    const firstRowColumns = (firstRow.match(/\|/g) || []).length - 1; // Subtract 1 for the opening |
    if (firstRowColumns > 0) {
      const separator = `|${" --- |".repeat(firstRowColumns)}`;
      result.push(separator);
    }

    // Add remaining rows
    result.push(...rows.slice(1));

    return result.join("\n");
  }

  tableRow(children: string[]): string {
    return `| ${children.join(" | ")} |`;
  }

  tableHeader(children: string[], colspan?: number, _rowspan?: number): string {
    // For markdown, we'll just render the content
    // Colspan/rowspan are not well-supported in standard markdown
    // If colspan > 1, we'll add empty cells to represent it
    const content = children.join("");
    if (colspan && colspan > 1) {
      // Add empty cells for colspan (colspan - 1 empty cells)
      return content + " | " + " | ".repeat(colspan - 1);
    }
    return content;
  }

  tableCell(children: string[], colspan?: number, _rowspan?: number): string {
    // For markdown, we'll just render the content
    // Colspan/rowspan are not well-supported in standard markdown
    // If colspan > 1, we'll add empty cells to represent it
    const content = children.join("");
    if (colspan && colspan > 1) {
      // Add empty cells for colspan (colspan - 1 empty cells)
      return content + " | " + " | ".repeat(colspan - 1);
    }
    return content;
  }

  customBlock(name: string, properties: Record<string, any>): string {
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
    return text
      .replace(/\\/g, "\\\\") // Backslash must be escaped
      .replace(/\[/g, "\\[") // Opening bracket (for links)
      .replace(/\]/g, "\\]"); // Closing bracket (for links)
  }

  private escapeAttribute(text: string): string {
    return text.replace(/"/g, '\\"');
  }
}

// For backwards compatibility
export { MarkdownSerializer as MarkdownBuilder };
