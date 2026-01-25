import { HTMLElement, Node, TextNode, parse } from "node-html-parser";

export function deserializeFromHTML(html: string): any {
  const root = parse(html);
  const content: any[] = [];

  const parseNode = (node: Node, isInlineContext = false): any[] => {
    if (node instanceof TextNode) {
      const text = node.text;
      if (!text) return [];

      if (!isInlineContext && text.trim() === "") {
        return [];
      }

      return [{ type: "text", text }];
    }

    if (node instanceof HTMLElement) {
      const tagName = node.tagName.toLowerCase();

      switch (tagName) {
        case "p":
        case "div": {
          const children = node.childNodes.flatMap((n) => parseNode(n, true));
          if (children.length === 0) {
            return [];
          }
          return [
            {
              type: "paragraph",
              content: children.length > 0 ? children : undefined,
            },
          ];
        }
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6": {
          const level = parseInt(tagName.substring(1), 10);
          const children = node.childNodes.flatMap((n) => parseNode(n, true));
          return [
            {
              type: "heading",
              attrs: { level },
              content: children.length > 0 ? children : undefined,
            },
          ];
        }
        case "ul": {
          const children = node.childNodes.flatMap((n) => parseNode(n, false));
          const listItems = children.filter((c) => c.type === "listItem");
          return [
            {
              type: "bulletList",
              content: listItems,
            },
          ];
        }
        case "ol": {
          const startAttr = node.getAttribute("start");
          const start = startAttr ? parseInt(startAttr, 10) : undefined;

          const children = node.childNodes.flatMap((n) => parseNode(n, false));
          const listItems = children.filter((c) => c.type === "listItem");

          return [
            {
              type: "orderedList",
              attrs: start ? { start } : undefined,
              content: listItems,
            },
          ];
        }
        case "li": {
          const children = node.childNodes.flatMap((n) => parseNode(n, false));

          const isInlineNode = (node: any) => node.type === "text" || node.type === "hardBreak";
          const isBlockNode = (node: any) =>
            [
              "paragraph",
              "heading",
              "bulletList",
              "orderedList",
              "codeBlock",
              "horizontalRule",
            ].includes(node.type);

          const processedContent: any[] = [];
          let inlineBuffer: any[] = [];

          const flushInlineBuffer = () => {
            if (inlineBuffer.length > 0) {
              processedContent.push({
                type: "paragraph",
                content: inlineBuffer,
              });
              inlineBuffer = [];
            }
          };

          for (const child of children) {
            if (isInlineNode(child)) {
              inlineBuffer.push(child);
            } else if (isBlockNode(child)) {
              flushInlineBuffer();
              processedContent.push(child);
            }
          }
          flushInlineBuffer();

          if (processedContent.length === 0) {
            processedContent.push({
              type: "paragraph",
              content: undefined,
            });
          }

          return [
            {
              type: "listItem",
              content: processedContent,
            },
          ];
        }
        case "hr": {
          return [{ type: "horizontalRule" }];
        }
        case "pre": {
          const codeChild = node.childNodes.find(
            (n) => n instanceof HTMLElement && n.tagName.toLowerCase() === "code",
          );

          let text = "";
          let language: string | undefined;

          if (codeChild) {
            text = codeChild.childNodes
              .filter((n) => n instanceof TextNode)
              .map((n) => n.text)
              .join("");

            if (!text && codeChild.text) {
              text = codeChild.text;
            }

            const className = (codeChild as HTMLElement).getAttribute("class");
            if (className && className.startsWith("language-")) {
              language = className.replace("language-", "");
            }
          } else {
            text = node.text;
          }

          return [
            {
              type: "codeBlock",
              attrs: language ? { language } : undefined,
              content: [
                {
                  type: "text",
                  text,
                },
              ],
            },
          ];
        }
        case "br": {
          return [{ type: "hardBreak" }];
        }
        case "img": {
          const src = node.getAttribute("src");
          const alt = node.getAttribute("alt");
          const title = node.getAttribute("title");
          if (src) {
            return [
              {
                type: "image",
                attrs: {
                  src,
                  alt,
                  title,
                },
              },
            ];
          }
          return [];
        }

        case "table": {
          const children = node.childNodes.flatMap((n) => parseNode(n, false));
          const tableRows = children.filter((c) => c.type === "tableRow");
          return [
            {
              type: "table",
              content: tableRows,
            },
          ];
        }

        case "tr": {
          const children = node.childNodes.flatMap((n) => parseNode(n, false));
          const cells = children.filter((c) => c.type === "tableHeader" || c.type === "tableCell");
          return [
            {
              type: "tableRow",
              content: cells,
            },
          ];
        }

        case "th": {
          const colspan = node.getAttribute("colspan");
          const rowspan = node.getAttribute("rowspan");
          const children = node.childNodes.flatMap((n) => parseNode(n, false));

          // Ensure at least one paragraph
          const hasParagraph = children.some((c) => c.type === "paragraph");
          const content = hasParagraph ? children : [{ type: "paragraph", content: [] }];

          const attrs: any = {};
          if (colspan) {
            const colspanNum = parseInt(colspan, 10);
            if (!isNaN(colspanNum) && colspanNum > 1) {
              attrs.colspan = colspanNum;
            }
          }
          if (rowspan) {
            const rowspanNum = parseInt(rowspan, 10);
            if (!isNaN(rowspanNum) && rowspanNum > 1) {
              attrs.rowspan = rowspanNum;
            }
          }

          return [
            {
              type: "tableHeader",
              attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
              content,
            },
          ];
        }

        case "td": {
          const colspan = node.getAttribute("colspan");
          const rowspan = node.getAttribute("rowspan");
          const children = node.childNodes.flatMap((n) => parseNode(n, false));

          // Ensure at least one paragraph
          const hasParagraph = children.some((c) => c.type === "paragraph");
          const content = hasParagraph ? children : [{ type: "paragraph", content: [] }];

          const attrs: any = {};
          if (colspan) {
            const colspanNum = parseInt(colspan, 10);
            if (!isNaN(colspanNum) && colspanNum > 1) {
              attrs.colspan = colspanNum;
            }
          }
          if (rowspan) {
            const rowspanNum = parseInt(rowspan, 10);
            if (!isNaN(rowspanNum) && rowspanNum > 1) {
              attrs.rowspan = rowspanNum;
            }
          }

          return [
            {
              type: "tableCell",
              attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
              content,
            },
          ];
        }

        case "strong":
        case "b":
        case "em":
        case "i":
        case "u":
        case "code":
        case "a": {
          const children = node.childNodes.flatMap((n) => parseNode(n, true));

          let mark: any;
          if (tagName === "strong" || tagName === "b") mark = { type: "bold" };
          if (tagName === "em" || tagName === "i") mark = { type: "italic" };
          if (tagName === "u") mark = { type: "underline" }; // formatting?
          if (tagName === "code") mark = { type: "code" };
          if (tagName === "a") {
            mark = {
              type: "link",
              attrs: {
                href: node.getAttribute("href"),
                target: node.getAttribute("target"),
              },
            };
          }

          if (!mark) return children;

          return children.map((child) => {
            if (child.type === "text") {
              return {
                ...child,
                marks: [...(child.marks || []), mark],
              };
            }
            return child;
          });
        }

        default:
          return node.childNodes.flatMap((n) => parseNode(n, isInlineContext));
      }
    }

    return [];
  };

  root.childNodes.forEach((node) => {
    const parsed = parseNode(node, false);

    parsed.forEach((p) => {
      if (p.type === "text" || (p.marks && p.type === "text")) {
        const last = content[content.length - 1];
        if (last && last.type === "paragraph") {
          last.content = last.content || [];
          last.content.push(p);
        } else {
          content.push({
            type: "paragraph",
            content: [p],
          });
        }
      } else {
        content.push(p);
      }
    });
  });

  if (content.length === 0) {
    content.push({ type: "paragraph", content: [] });
  }

  return {
    type: "doc",
    content,
  };
}
