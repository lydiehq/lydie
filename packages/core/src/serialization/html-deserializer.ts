/**
 * HTML to TipTap JSON deserializer
 * Deserializes HTML strings to TipTap JSON format
 */

import { parse, HTMLElement, TextNode, Node } from "node-html-parser";

/**
 * Options for HTML deserialization
 */
export interface HTMLDeserializeOptions {
    /**
      * Whether to preserve empty paragraphs
      * @default false
      */
    preserveEmptyParagraphs?: boolean;
}

/**
 * Deserialize HTML string to TipTap JSON
 */
export function deserializeFromHTML(
    html: string,
    options: HTMLDeserializeOptions = {}
): any {
    const root = parse(html);
    const content: any[] = [];

    // Helper to parse individual nodes
    const parseNode = (node: Node): any[] => {
        if (node instanceof TextNode) {
            const text = node.text; // node-html-parser decodes entities automatically in recent versions, but check this
            // Actually, node-html-parser .text might decode some, but let's assume it's raw text content.
            // It's usually safer to trim newlines if they are just formatting, 
            // but for inline text we want to keep spaces.
            if (!text) return [];
            // Basic text node
            return [{ type: "text", text }];
        }

        if (node instanceof HTMLElement) {
            const tagName = node.tagName.toLowerCase();

            // Block elements
            switch (tagName) {
                case "p":
                case "div": {
                    const children = node.childNodes.flatMap(parseNode);
                    if (children.length === 0 && !options.preserveEmptyParagraphs) {
                        return [];
                    }
                    // Filter out purely whitespace text nodes if they are the only children? 
                    // TipTap usually wants at least something or empty paragraph is fine.
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
                    const children = node.childNodes.flatMap(parseNode);
                    return [
                        {
                            type: "heading",
                            attrs: { level },
                            content: children.length > 0 ? children : undefined,
                        },
                    ];
                }
                case "ul": {
                    const children = node.childNodes.flatMap(parseNode); // expects listItems
                    // Filter to only listItems (logic handled in li case or filtered here)
                    // node-html-parser might include whitespace text nodes between LIs
                    const listItems = children.filter((c) => c.type === "listItem");
                    return [
                        {
                            type: "bulletList",
                            content: listItems,
                        },
                    ];
                }
                case "ol": {
                    // Check for start attribute? node-html-parser attributes are strings
                    const startAttr = node.getAttribute("start");
                    const start = startAttr ? parseInt(startAttr, 10) : undefined;

                    const children = node.childNodes.flatMap(parseNode);
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
                    const children = node.childNodes.flatMap(parseNode);
                    // List items usually contain paragraphs in TipTap strict schema, 
                    // or inline content is wrapped in paragraph automatically by TipTap?
                    // Lydie schema seems to expect content: [ { type: 'paragraph', ... } ] usually.
                    // Let's wrap inline content in a paragraph if it's mixed.

                    // Simple heuristic: if children are just text/marks, wrap in paragraph.
                    // If children contain block elements (p, div, ul, ol), keep as is? 
                    // TipTap schema for listItem is typically content: "paragraph block*"

                    let hasBlock = children.some(c => ["paragraph", "heading", "bulletList", "orderedList"].includes(c.type));

                    if (!hasBlock) {
                        return [{
                            type: "listItem",
                            content: [{
                                type: "paragraph",
                                content: children.length > 0 ? children : undefined
                            }]
                        }];
                    }

                    return [
                        {
                            type: "listItem",
                            content: children,
                        },
                    ];
                }
                case "hr": {
                    return [{ type: "horizontalRule" }];
                }
                case "br": {
                    return [{ type: "hardBreak" }];
                }
                case "img": {
                    const src = node.getAttribute("src");
                    const alt = node.getAttribute("alt");
                    const title = node.getAttribute("title");
                    if (src) {
                        return [{
                            type: "image",
                            attrs: {
                                src,
                                alt,
                                title
                            }
                        }];
                    }
                    return [];
                }

                // Inline marks (bold, italic, link, code)
                // Note: flattening logic above handles merging marks, but recursive logic is trickier.
                // We need to return text nodes with marks applied.
                case "strong":
                case "b":
                case "em":
                case "i":
                case "u":
                case "code":
                case "a": {
                    // These are inline wrappers. We parse children, then apply the current mark to all text nodes returned.
                    const children = node.childNodes.flatMap(parseNode);

                    // Define the mark to apply
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
                                target: node.getAttribute("target")
                            }
                        };
                    }

                    if (!mark) return children; // Should not happen based on switch

                    // Add mark to all text/image children
                    return children.map(child => {
                        if (child.type === "text") {
                            return {
                                ...child,
                                marks: [...(child.marks || []), mark]
                            };
                        }
                        // Determine if other inline nodes (image?) support marks. Text supports it.
                        return child;
                    });
                }

                default:
                    // Unknown block or inline tag. 
                    // Treat as transparent container? Or ignore?
                    // Let's treat as transparent container (unwrap)
                    return node.childNodes.flatMap(parseNode);
            }
        }

        return [];
    };

    // Process root nodes
    root.childNodes.forEach((node) => {
        // Check for top-level text nodes (should be wrapped in paragraph?)
        // or valid top-level blocks.
        const parsed = parseNode(node);

        // If parsed nodes are inline (text), they need to be wrapped in a block (paragraph) if at top level
        // Exception: if we are building a fragment. But type: "doc" expects blocks.
        // We will check type.

        parsed.forEach(p => {
            if (p.type === "text" || (p.marks && p.type === "text")) {
                // It's text. Find or create current paragraph in content?
                // Or just wrap loosely for now.
                // Simple strategy: if last element in content is paragraph, append. Else create new.
                const last = content[content.length - 1];
                if (last && last.type === "paragraph") {
                    last.content = last.content || [];
                    last.content.push(p);
                } else {
                    content.push({
                        type: "paragraph",
                        content: [p]
                    });
                }
            } else {
                // Block node
                content.push(p);
            }
        });
    });

    // Ensure doc has content
    if (content.length === 0) {
        content.push({ type: "paragraph", content: [] });
    }

    return {
        type: "doc",
        content,
    };
}
