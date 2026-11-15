import type { JSONContent } from "@lydie/editor";

const text = (value: string, marks?: JSONContent["marks"]): JSONContent =>
  marks ? { type: "text", text: value, marks } : { type: "text", text: value };
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const li = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });

const IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="680" height="200" viewBox="0 0 680 200"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#1f1f1f"/><stop offset="1" stop-color="#5a5a5a"/></linearGradient></defs><rect width="680" height="200" fill="url(#g)"/><text x="340" y="108" fill="#fff" font-family="Inter, sans-serif" font-size="22" text-anchor="middle">image (src, alt, title)</text></svg>`,
  );

// One of every node and mark in the Lydie schema, for checking the look against v1.
export const sampleContent: JSONContent = {
  type: "doc",
  content: [
    p(
      text("Most documentation problems are not sentence-level problems. They are "),
      text("category", [{ type: "italic" }]),
      text(
        " problems: a page tries to teach, guide and specify at the same time. This sentence has ",
      ),
      text("bold", [{ type: "bold" }]),
      text(", "),
      text("strike", [{ type: "strike" }]),
      text(", "),
      text("inline code", [{ type: "code" }]),
      text(", a "),
      text("link", [{ type: "link", attrs: { href: "https://lydie.co", title: null } }]),
      text(" and "),
      text("highlighted text", [{ type: "highlight" }]),
      text("."),
    ),
    p(
      text("Wiki links: "),
      {
        type: "wikiLink",
        attrs: { target: "Technical writing", heading: null, blockId: null, alias: null },
      },
      text(", "),
      {
        type: "wikiLink",
        attrs: { target: "Diátaxis", heading: "Tutorials", blockId: null, alias: null },
      },
      text(" and "),
      {
        type: "wikiLink",
        attrs: { target: "Outline", heading: null, blockId: "a1b2", alias: "an aliased block" },
      },
      text(". A footnote"),
      { type: "footnoteReference", attrs: { label: "1" } },
      text(", inline math "),
      { type: "mathInline", content: [text("e^{i\\pi} + 1 = 0")] },
      text(", raw inline Markdown "),
      { type: "rawInline", attrs: { source: "<kbd>Ctrl</kbd>" } },
      text(" and a hard break:"),
      { type: "hardBreak" },
      text("on the next line."),
    ),
    {
      type: "heading",
      attrs: { level: 2 },
      content: [text("What Diátaxis is (and what it is not)")],
    },
    p(text("It separates documentation into four types:")),
    {
      type: "bulletList",
      content: [
        li(p(text("Tutorials", [{ type: "bold" }]), text(": learning-oriented, guided journeys"))),
        li(p(text("How-to guides", [{ type: "bold" }]), text(": goal-oriented steps")), {
          type: "bulletList",
          content: [li(p(text("A nested bullet")))],
        }),
        li(p(text("Reference", [{ type: "bold" }]), text(": information-oriented descriptions"))),
        li(p(text("Explanation", [{ type: "bold" }]), text(": understanding-oriented context"))),
      ],
    },
    { type: "heading", attrs: { level: 3 }, content: [text("Ordered list starting at 3")] },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [li(p(text("Third step"))), li(p(text("Fourth step")))],
    },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [p(text("Port the design system"))],
        },
        {
          type: "taskItem",
          attrs: { checked: false },
          content: [
            p(text("Wire the Markdown engine")),
            {
              type: "taskList",
              content: [
                { type: "taskItem", attrs: { checked: false }, content: [p(text("Nested task"))] },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "blockquote",
      content: [p(text("Documentation needs to serve four different user needs."))],
    },
    {
      type: "callout",
      attrs: { kind: "note", title: null, fold: null },
      content: [
        p(
          text("A note callout, written "),
          text("> [!note]", [{ type: "code" }]),
          text(" in Markdown."),
        ),
      ],
    },
    {
      type: "callout",
      attrs: { kind: "warning", title: "Foldable warning", fold: "open" },
      content: [p(text("This one can be collapsed with the chevron."))],
    },
    {
      type: "callout",
      attrs: { kind: "tip", title: "Collapsed tip", fold: "closed" },
      content: [p(text("Hidden until expanded."))],
    },
    {
      type: "codeBlock",
      attrs: { language: "typescript" },
      content: [
        text(
          'import { getLydieSchema } from "@lydie/editor";\n\n// The contract with @lydie/markdown\nconst schema = getLydieSchema();\nconsole.log(Object.keys(schema.nodes).length);',
        ),
      ],
    },
    { type: "mathBlock", content: [text("\\int_0^1 x^2 \\, dx = \\frac{1}{3}")] },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", attrs: { align: "left" }, content: [p(text("Type"))] },
            { type: "tableHeader", attrs: { align: "left" }, content: [p(text("Oriented to"))] },
            { type: "tableHeader", attrs: { align: "right" }, content: [p(text("Pages"))] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [p(text("Tutorial"))] },
            { type: "tableCell", content: [p(text("Learning"))] },
            { type: "tableCell", attrs: { align: "right" }, content: [p(text("4"))] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [p(text("Reference"))] },
            { type: "tableCell", content: [p(text("Information"))] },
            { type: "tableCell", attrs: { align: "right" }, content: [p(text("12"))] },
          ],
        },
      ],
    },
    { type: "image", attrs: { src: IMAGE, alt: "A gradient placeholder", title: "Image title" } },
    { type: "horizontalRule" },
    { type: "embed", attrs: { target: "Outline#Structure" } },
    {
      type: "directive",
      attrs: { name: "aside", attrs: { tone: "quiet" } },
      content: [
        p(
          text("A Lydie-only block, written as a "),
          text(":::aside", [{ type: "code" }]),
          text(" directive."),
        ),
      ],
    },
    {
      type: "rawBlock",
      attrs: {
        source: "<details>\n  <summary>Raw HTML block</summary>\n  Kept verbatim.\n</details>",
      },
    },
    {
      type: "footnoteDefinition",
      attrs: { label: "1" },
      content: [
        p(text("The footnote text, from "), text("[^1]: …", [{ type: "code" }]), text(".")),
      ],
    },
  ],
};
