// The body transform on HTML shaped as Notion's export writes it (one line, each list item in a
// list of its own, `div.indented`, KaTeX with its TeX in an annotation).
import { describe, expect, test } from "bun:test";

import { prepareBody } from "./body.ts";
import type { BodyContext } from "./body.ts";

const PAGE = "aaaaaaaa-0000-7000-8000-000000000001";
const DB = "aaaaaaaa-0000-7000-8000-000000000002";
const FILE = "aaaaaaaa-0000-7000-8000-000000000003";

function prepare(html: string, overrides: Partial<BodyContext> = {}) {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(
    `<html><body><div class="page-body">${html}</div></body></html>`,
    "text/html",
  );
  const out = prepareBody(doc.querySelector(".page-body")!, {
    dir: "Home 11111111111111111111111111111111",
    pageOf: (path) => (path.endsWith("Plan 22222222222222222222222222222222.html") ? PAGE : null),
    pageOfNotionId: (id) => (id === "22222222222222222222222222222222" ? PAGE : null),
    databaseOfRow: (path) => (path.includes("Tasks 33333333333333333333333333333333/") ? DB : null),
    fileOf: (path) => (path.endsWith("cat.jpg") || path.endsWith("spec.pdf") ? FILE : null),
    warn: (message) => warnings.push(message),
    ...overrides,
  });
  return { out, warnings };
}

const tex = (source: string) =>
  `<span class="katex"><span class="katex-mathml"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">${source}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">rendered</span></span>`;

describe("prepareBody", () => {
  test("adjacent one-item lists are one list", () => {
    const { out } = prepare(
      '<ul id="a" class="bulleted-list"><li style="list-style-type:disc">One</li></ul><ul id="b" class="bulleted-list"><li style="list-style-type:disc">Two</li></ul><ol type="1" class="numbered-list" start="1"><li>Three</li></ol>',
    );
    expect(out).toBe(
      '<ul id="a" class="bulleted-list"><li style="list-style-type:disc">One</li><li style="list-style-type:disc">Two</li></ul><ol type="1" class="numbered-list" start="1"><li>Three</li></ol>',
    );
  });

  test("to-dos are task items", () => {
    const { out } = prepare(
      '<ul class="to-do-list"><li><div class="checkbox checkbox-on"></div> <span class="to-do-children-checked">Done</span><div class="indented"><p>More</p></div></li></ul><ul class="to-do-list"><li><div class="checkbox checkbox-off"></div> <span class="to-do-children-unchecked">Open</span></li></ul>',
    );
    expect(out).toBe(
      '<ul class="to-do-list" data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p><p>More</p></li><li data-type="taskItem" data-checked="false"><p>Open</p></li></ul>',
    );
  });

  test("callouts take their kind from the icon", () => {
    const { out } = prepare(
      '<figure class="block-color-gray_background callout" style="white-space:pre-wrap;display:flex"><div style="font-size:1.5em"><span class="icon">💡</span></div><div style="width:100%"><p>Try this.</p></div></figure>',
    );
    expect(out).toBe(
      '<div data-type="callout" data-kind="tip"><div data-callout-content=""><p>Try this.</p></div></div>',
    );
  });

  test("toggles fold; toggle headings are headings", () => {
    const { out } = prepare(
      '<ul class="toggle"><li><details open=""><summary>Details</summary><p>Hidden</p></details></li></ul><details open=""><summary style="font-weight:600;font-size:1.5em;line-height:1.3;margin:0">Section</summary><p>Under it</p></details>',
    );
    expect(out).toBe(
      '<div data-type="callout" data-kind="note" data-fold="-" data-title="Details"><div data-callout-content=""><p>Hidden</p></div></div><h2>Section</h2><p>Under it</p>',
    );
  });

  test("equations", () => {
    const { out } = prepare(
      `<figure class="equation"><div class="equation-container"><span class="katex-display">${tex("E = mc^2")}</span></div></figure><p>Area <span data-token-index="0" class="notion-text-equation-token">${tex("\\pi r^2")}</span></p>`,
    );
    expect(out).toBe(
      '<div data-type="math-block">E = mc^2</div><p>Area <span data-type="math-inline">\\pi r^2</span></p>',
    );
  });

  test("code languages", () => {
    const { out } = prepare(
      '<pre class="code"><code class="language-JavaScript">a()</code></pre><pre class="code"><code class="language-Plain Text">#abc</code></pre>',
    );
    expect(out).toBe(
      '<pre class="code"><code class="language-javascript">a()</code></pre><pre class="code"><code>#abc</code></pre>',
    );
  });

  test("links to pages, by path and by notion.so address, are wiki links", () => {
    const { out } = prepare(
      '<p>See <a href="Home%2011111111111111111111111111111111/Plan%2022222222222222222222222222222222.html">the plan</a> and <a href="https://www.notion.so/Plan-22222222222222222222222222222222">again</a>, <a href="https://example.com">a site</a>, <a href="#heading">a heading</a>.</p><figure class="link-to-page"><a href="Home%2011111111111111111111111111111111/Plan%2022222222222222222222222222222222.html"><span class="icon">📄</span>Plan</a></figure>',
    );
    const link = (alias: string) =>
      `<a data-type="wiki-link" data-target="lydie-import:${PAGE}" data-alias="${alias}">${alias}</a>`;
    expect(out).toBe(
      `<p>See ${link("the plan")} and ${link("again")}, <a href="https://example.com">a site</a>, a heading.</p><p>${link("Plan")}</p>`,
    );
  });

  test("images and files of the export are embeds; others stay links and images", () => {
    const { out } = prepare(
      '<figure class="image"><a href="Home%2011111111111111111111111111111111/cat.jpg"><img style="width:720px" src="Home%2011111111111111111111111111111111/cat.jpg"/></a><figcaption>A cat</figcaption></figure><figure class="image"><a href="https://example.com/dog.png"><img src="https://example.com/dog.png"/></a></figure><figure><div class="source"><a href="Home%2011111111111111111111111111111111/spec.pdf">spec.pdf</a></div></figure><figure><div class="source"><a href="https://w.wiki/Wz6">https://w.wiki/Wz6</a></div></figure>',
    );
    expect(out).toBe(
      `<div data-type="embed" data-target="lydie-file:${FILE}"></div><p><em>A cat</em></p><img src="https://example.com/dog.png" alt=""><div data-type="embed" data-target="lydie-file:${FILE}"></div><p><a href="https://w.wiki/Wz6">https://w.wiki/Wz6</a></p>`,
    );
  });

  test("inline databases are embeds of the imported collection", () => {
    const { out, warnings } = prepare(
      '<div class="collection-content"><h4 class="collection-title">Tasks</h4><table class="collection-content"><thead><tr><th>Name</th></tr></thead><tbody><tr><td class="cell-title"><a href="Home%2011111111111111111111111111111111/Tasks%2033333333333333333333333333333333/Write%2044444444444444444444444444444444.html">Write</a></td></tr></tbody></table></div>',
    );
    expect(out).toBe(`<div data-type="embed" data-target="lydie-import:${DB}.base"></div>`);
    expect(warnings).toEqual([]);
  });

  test("highlights keep backgrounds; text colours go", () => {
    const { out } = prepare(
      '<p><mark class="highlight-pink"><mark class="highlight-yellow_background">both</mark></mark> <mark class="highlight-red">red</mark> <time>@March 1, 2024</time></p>',
    );
    expect(out).toBe(
      '<p><mark class="highlight-yellow_background">both</mark> red March 1, 2024</p>',
    );
  });

  test("line breaks: the export's stray ones go, two in a row end a paragraph", () => {
    const { out } = prepare(
      "<p>with a<br/>forced linebreak and <br/><strong>bold</strong>.</p><p>One<br/><br/>Two<br/></p><p>soft\nbreak</p>",
    );
    expect(out).toBe(
      "<p>with a<br>forced linebreak and <strong>bold</strong>.</p><p>One</p><p>Two</p><p>soft<br>break</p>",
    );
  });

  test("columns", () => {
    const { out } = prepare(
      '<div class="column-list"><div style="width:50%" class="column"><p>Left</p></div><div style="width:50%" class="column"><p>Right</p></div></div>',
    );
    expect(out).toBe(
      '<div class="column-list" data-type="column-list"><div class="column" data-type="column"><p>Left</p></div><div class="column" data-type="column"><p>Right</p></div></div>',
    );
  });
});
