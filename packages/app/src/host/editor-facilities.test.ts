import { describe, expect, test } from "bun:test";

import { createContributionRegistry } from "./contributions.ts";
import { createEditorFacilities } from "./editor-facilities.ts";

const editor = createEditorFacilities(createContributionRegistry());

describe("fromHtml", () => {
  test.each([
    ["<p>Hello <strong>bold</strong> and <em>it</em></p>", "Hello **bold** and *it*\n"],
    ["<h2>Title</h2><p>Text</p>", "## Title\n\nText\n"],
    ["<ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>", "- One\n- Two\n  - Nested\n"],
    [
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li><li data-type="taskItem" data-checked="false"><p>Open</p></li></ul>',
      "- [x] Done\n- [ ] Open\n",
    ],
    [
      '<p>See <a data-type="wiki-link" data-target="Notes/Plan" data-alias="the plan">the plan</a>.</p>',
      "See [[Notes/Plan|the plan]].\n",
    ],
    ['<div data-type="embed" data-target="photo.png"></div>', "![[photo.png]]\n"],
    [
      '<div data-type="callout" data-kind="tip"><div data-callout-content><p>Careful</p></div></div>',
      "> [!tip]\n> Careful\n",
    ],
    [
      '<div data-type="callout" data-kind="note" data-fold="-" data-title="More"><div data-callout-content><p>Hidden</p></div></div>',
      "> [!note]- More\n> Hidden\n",
    ],
    ['<p>Area <span data-type="math-inline">\\pi r^2</span></p>', "Area $\\pi r^2$\n"],
    ['<div data-type="math-block">E = mc^2</div>', "$$\nE = mc^2\n$$\n"],
    ['<pre><code class="language-python">print(1)</code></pre>', "```python\nprint(1)\n```\n"],
    ["<p><mark>marked</mark> and <del>gone</del></p>", "==marked== and ~~gone~~\n"],
    ['<p><a href="https://example.com">a link</a></p>', "[a link](https://example.com)\n"],
    [
      '<p>Above</p><img src="https://example.com/a.png" alt="A">',
      "Above\n\n![A](https://example.com/a.png)\n",
    ],
  ])("%s", (html, markdown) => {
    expect(editor.fromHtml(html)).toBe(markdown);
  });

  test("columns", () => {
    const md = editor.fromHtml(
      '<div data-type="column-list"><div data-type="column"><p>Left</p></div><div data-type="column"><p>Right</p></div></div>',
    );
    expect(md).toContain("Left");
    expect(md).toContain("Right");
    expect(md).toContain(":::column");
  });
});

describe("splitFrontmatter", () => {
  test("properties and the body after them", () => {
    expect(editor.splitFrontmatter("---\ntags: [a, b]\nstatus: Done\n---\n# Hi\n")).toEqual({
      properties: { tags: ["a", "b"], status: "Done" },
      body: "# Hi\n",
    });
  });

  test("no frontmatter", () => {
    expect(editor.splitFrontmatter("Just text\n")).toEqual({
      properties: null,
      body: "Just text\n",
    });
  });
});
