// A page body of Notion's HTML export, reshaped into the HTML the editor reads (its parse rules,
// as `app.editor.fromHtml` applies them): callouts and toggles become callouts, to-dos task lists,
// equations math, column lists columns, links to pages wiki links, images and files embeds of
// attachments, inline databases embeds of the imported database. Notion's export quirks are
// undone on the way (one list per item, stray line breaks, wrappers).
import { importDatabaseEmbed, importFileRef, importLink } from "@lydie/plugin-api";

import { notionIdOf, resolveHref } from "./names.ts";

export type BodyContext = {
  // The page's folder in the export; links are relative to it.
  dir: string;
  pageOf(path: string): string | null;
  pageOfNotionId(id: string): string | null;
  // The database whose rows include the page at `path`, for an inline database's table.
  databaseOfRow(path: string): string | null;
  // The plan file for an export path; null when it is not in the export.
  fileOf(path: string): string | null;
  warn(message: string): void;
};

const BLOCK = new Set([
  "P",
  "DIV",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "TD",
  "TH",
  "FIGURE",
  "FIGCAPTION",
  "SUMMARY",
  "DETAILS",
]);

function el(doc: Document, tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function hoist(node: Element) {
  node.replaceWith(...node.childNodes);
}

const plain = (node: Element | null) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

function texOf(node: Element): string {
  return (node.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? "").trim();
}

function equations(body: Element) {
  const doc = body.ownerDocument;
  for (const figure of body.querySelectorAll("figure.equation")) {
    const math = el(doc, "div", { "data-type": "math-block" });
    math.textContent = texOf(figure);
    figure.replaceWith(math);
  }
  for (const token of body.querySelectorAll(".notion-text-equation-token")) {
    const math = el(doc, "span", { "data-type": "math-inline" });
    math.textContent = texOf(token).replace(/\s*\n\s*/g, " ");
    token.replaceWith(math);
  }
}

function embedOf(doc: Document, target: string): HTMLElement {
  return el(doc, "div", { "data-type": "embed", "data-target": target });
}

function wikiLink(doc: Document, target: string, alias: string): HTMLElement {
  const link = el(doc, "a", { "data-type": "wiki-link", "data-target": target });
  if (alias) link.setAttribute("data-alias", alias);
  link.textContent = alias;
  return link;
}

function captionAfter(figure: Element, block: Element) {
  const caption = figure.querySelector("figcaption");
  if (!caption || !plain(caption)) return;
  const p = el(figure.ownerDocument, "p");
  const em = el(figure.ownerDocument, "em");
  em.append(...caption.childNodes);
  p.append(em);
  block.after(p);
}

function inlineDatabases(body: Element, ctx: BodyContext) {
  const doc = body.ownerDocument;
  for (const table of body.querySelectorAll("table.collection-content")) {
    const wrapper = table.closest("div.collection-content") ?? table;
    const href = table.querySelector("td.cell-title a[href], tbody a[href]")?.getAttribute("href");
    const path = href ? resolveHref(href, ctx.dir) : null;
    const database = path ? ctx.databaseOfRow(path) : null;
    if (database) wrapper.replaceWith(embedOf(doc, importDatabaseEmbed(database)));
    else {
      // A linked view of a database elsewhere, or an empty one: its table as it was.
      wrapper.querySelector(".collection-title")?.remove();
      ctx.warn("A database view whose database is not in the export was imported as a table.");
    }
  }
}

const CALLOUT_ICONS: [RegExp, string][] = [
  [/💡|lightbulb|bulb/, "tip"],
  [/⚠|warning|alert/, "warning"],
  [/❗|‼|important|exclamation/, "important"],
  [/❓|❔|question|help/, "question"],
  [/✅|✔|☑|check|success/, "success"],
  [/❌|🚫|⛔|failure|error|cross/, "failure"],
  [/🔥|danger/, "danger"],
  [/🐞|🐛|bug/, "bug"],
  [/ℹ|info/, "info"],
  [/💬|quote/, "quote"],
  [/📝|✏|note|pencil/, "note"],
];

function calloutKind(icon: Element | null): string {
  if (!icon) return "note";
  const label = `${icon.textContent ?? ""} ${icon.querySelector("img")?.getAttribute("src") ?? ""}`;
  return CALLOUT_ICONS.find(([pattern]) => pattern.test(label.toLowerCase()))?.[1] ?? "note";
}

function callout(doc: Document, kind: string, children: Iterable<Node>, extra = {}): HTMLElement {
  const box = el(doc, "div", { "data-type": "callout", "data-kind": kind, ...extra });
  const content = el(doc, "div", { "data-callout-content": "" });
  content.append(...children);
  box.append(content);
  return box;
}

function callouts(body: Element) {
  const doc = body.ownerDocument;
  for (const figure of body.querySelectorAll("figure.callout")) {
    const parts = [...figure.children];
    const content = parts.length > 1 ? parts.at(-1)! : (parts[0] ?? figure);
    const icon = parts.length > 1 ? parts[0]! : null;
    figure.replaceWith(callout(doc, calloutKind(icon), [...content.childNodes]));
  }
}

const HEADING_SIZES: [string, string][] = [
  ["1.875em", "H1"],
  ["1.5em", "H2"],
  ["1.25em", "H3"],
];

// Toggles fold: a foldable callout titled with the toggle's line. A toggle heading becomes the
// heading, with what it folded under it.
function toggles(body: Element) {
  const doc = body.ownerDocument;
  for (const details of [...body.querySelectorAll("details")].reverse()) {
    const summary = details.querySelector(":scope > summary");
    const rest = [...details.childNodes].filter((n) => n !== summary);
    const style = summary?.getAttribute("style") ?? "";
    const level =
      summary?.querySelector("h1, h2, h3")?.tagName ??
      HEADING_SIZES.find(([size]) => style.includes(size))?.[1];
    const replacement: Node[] = [];
    if (level) {
      const heading = el(doc, level.toLowerCase());
      heading.textContent = plain(summary);
      replacement.push(heading, ...rest);
    } else {
      const title = plain(summary);
      replacement.push(
        callout(doc, "note", rest.length ? rest : [el(doc, "p")], {
          "data-fold": "-",
          ...(title ? { "data-title": title } : {}),
        }),
      );
    }
    details.replaceWith(...replacement);
  }
  // `ul.toggle > li` only wrapped the toggle.
  for (const list of body.querySelectorAll("ul.toggle")) {
    for (const li of [...list.children]) hoist(li);
    hoist(list);
  }
}

function todos(body: Element) {
  const doc = body.ownerDocument;
  for (const list of body.querySelectorAll("ul.to-do-list")) {
    list.setAttribute("data-type", "taskList");
    for (const li of list.querySelectorAll(":scope > li")) {
      const box = li.querySelector(":scope > .checkbox");
      li.setAttribute("data-type", "taskItem");
      li.setAttribute("data-checked", String(box?.classList.contains("checkbox-on") ?? false));
      box?.remove();
      const span = li.querySelector(':scope > span[class^="to-do-children"]');
      const p = el(doc, "p");
      if (span) {
        p.append(...span.childNodes);
        span.replaceWith(p);
      } else li.prepend(p);
      // Leading whitespace Notion leaves after the checkbox.
      while (p.previousSibling && p.previousSibling.nodeType === 3) p.previousSibling.remove();
    }
  }
}

const LANGUAGES: Record<string, string> = {
  "plain text": "",
  plaintext: "",
  "c++": "cpp",
  "c#": "csharp",
  "f#": "fsharp",
  "objective-c": "objectivec",
  shell: "bash",
  "vb.net": "vbnet",
  "java/c/c++/c#": "java",
  markup: "html",
};

function code(body: Element) {
  for (const block of body.querySelectorAll("pre code")) {
    const match = /language-(.+)/.exec(block.getAttribute("class") ?? "");
    const raw = (match?.[1] ?? "").trim().toLowerCase();
    const language = raw in LANGUAGES ? LANGUAGES[raw]! : raw.replace(/\s+/g, "");
    if (language) block.setAttribute("class", `language-${language}`);
    else block.removeAttribute("class");
    for (const br of block.querySelectorAll("br")) br.replaceWith("\n");
  }
}

function columns(body: Element) {
  for (const list of body.querySelectorAll("div.column-list")) {
    list.setAttribute("data-type", "column-list");
    for (const column of list.querySelectorAll(":scope > div.column")) {
      column.setAttribute("data-type", "column");
      column.removeAttribute("style");
    }
  }
}

function media(body: Element, ctx: BodyContext) {
  const doc = body.ownerDocument;
  for (const figure of body.querySelectorAll("figure")) {
    if (!figure.isConnected) continue;
    if (figure.classList.contains("link-to-page")) {
      const a = figure.querySelector("a[href]");
      const p = el(doc, "p");
      if (a) p.append(a);
      figure.replaceWith(p);
      continue;
    }
    const bookmark = figure.querySelector("a.bookmark");
    if (bookmark) {
      const href = bookmark.getAttribute("href") ?? "";
      const link = el(doc, "a", { href });
      link.textContent = plain(bookmark.querySelector(".bookmark-title")) || href;
      const p = el(doc, "p");
      p.append(link);
      figure.replaceWith(p);
      continue;
    }
    const img = figure.querySelector("img:not(.icon)");
    const source = figure.querySelector(".source a[href]");
    const href = img?.getAttribute("src") ?? source?.getAttribute("href") ?? null;
    if (!href) continue;
    const path = resolveHref(href, ctx.dir);
    const file = path ? ctx.fileOf(path) : null;
    let block: HTMLElement;
    if (file) block = embedOf(doc, importFileRef(file));
    else if (img) block = el(doc, "img", { src: href, alt: img.getAttribute("alt") ?? "" });
    else {
      block = el(doc, "p");
      const link = el(doc, "a", { href });
      link.textContent = plain(source) || href;
      block.append(link);
    }
    figure.replaceWith(block);
    captionAfter(figure, block);
  }
}

function links(body: Element, ctx: BodyContext) {
  const doc = body.ownerDocument;
  for (const a of body.querySelectorAll("a[href]")) {
    if (a.getAttribute("data-type")) continue;
    const href = a.getAttribute("href") ?? "";
    // A link to a page carries the page's icon before its title.
    for (const icon of a.querySelectorAll(".icon")) icon.remove();
    const label = plain(a);
    if (href.startsWith("#")) {
      hoist(a);
      continue;
    }
    const path = resolveHref(href, ctx.dir);
    if (path) {
      const page = ctx.pageOf(path);
      const file = page ? null : ctx.fileOf(path);
      if (page) a.replaceWith(wikiLink(doc, importLink(page), label));
      else if (file) a.replaceWith(wikiLink(doc, importFileRef(file), label));
      else hoist(a);
      continue;
    }
    // Links to pages by their notion.so address (mentions, pages linked from outside a subtree).
    if (/^https?:\/\/(?:www\.)?notion\.(?:so|site)\//i.test(href)) {
      const id = notionIdOf(
        href
          .replace(/[?#].*$/, "")
          .split("/")
          .pop() ?? "",
      );
      const page = id ? ctx.pageOfNotionId(id) : null;
      if (page) a.replaceWith(wikiLink(doc, importLink(page), label));
    }
  }
}

function marks(body: Element) {
  for (const mark of body.querySelectorAll("mark")) {
    // Background colours are highlights; text colours have no Markdown, so the text stays plain.
    if (!/_background/.test(mark.getAttribute("class") ?? "")) hoist(mark);
  }
  // Nested highlights are one highlight.
  for (const mark of body.querySelectorAll("mark mark")) hoist(mark);
  for (const time of body.querySelectorAll("time")) {
    time.replaceWith((time.textContent ?? "").replace(/^@/, ""));
  }
  for (const img of body.querySelectorAll("img.icon")) img.remove();
}

// Notion puts each list item in a list of its own; adjacent lists of one kind are one list.
function mergeLists(body: Element) {
  for (const list of body.querySelectorAll("ul, ol")) {
    if (!list.isConnected) continue;
    let next = list.nextElementSibling;
    while (
      next &&
      next.tagName === list.tagName &&
      (next.getAttribute("class") ?? "") === (list.getAttribute("class") ?? "") &&
      (next.getAttribute("data-type") ?? "") === (list.getAttribute("data-type") ?? "")
    ) {
      const following = next.nextElementSibling;
      list.append(...next.children);
      next.remove();
      next = following;
    }
  }
}

// Notion's line breaks: a break before a change of formatting is an artefact of its export (the
// text had none there), a break that ends a block is nothing, and two in a row end a paragraph.
function breaks(body: Element) {
  const doc = body.ownerDocument;
  for (const br of body.querySelectorAll("br")) {
    const next = br.nextSibling;
    if (next && next.nodeType === 1 && /^(STRONG|EM|B|I|DEL|S|MARK|CODE)$/.test(next.nodeName)) {
      const before = br.previousSibling;
      if (before && before.nodeName !== "BR") br.remove();
    }
  }
  for (const br of [...body.querySelectorAll("br")].reverse()) {
    if (!br.isConnected) continue;
    if (!br.nextSibling && br.parentElement && BLOCK.has(br.parentElement.tagName)) br.remove();
  }
  for (const p of body.querySelectorAll("p")) {
    const nodes = [...p.childNodes];
    const split = nodes.findIndex((n, i) => n.nodeName === "BR" && nodes[i + 1]?.nodeName === "BR");
    if (split === -1) continue;
    const parts: Node[][] = [[]];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i]!.nodeName === "BR" && nodes[i + 1]?.nodeName === "BR") {
        parts.push([]);
        while (nodes[i + 1]?.nodeName === "BR") i++;
        continue;
      }
      parts.at(-1)!.push(nodes[i]!);
    }
    p.replaceWith(
      ...parts.map((part) => {
        const next = el(doc, "p");
        next.append(...part);
        return next;
      }),
    );
  }
  // Soft line breaks in the text itself (white-space: pre-wrap).
  const walker = doc.createTreeWalker(body, 4);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const t = node as Text;
    if (
      t.data.includes("\n") &&
      t.data.trim() &&
      !t.parentElement?.closest("pre, code, [data-type]")
    ) {
      texts.push(t);
    }
  }
  for (const t of texts) {
    const parts = t.data.split("\n");
    t.replaceWith(...parts.flatMap((part, i) => (i ? [el(doc, "br"), part] : [part])));
  }
}

// The body's HTML for `app.editor.fromHtml`.
export function prepareBody(body: Element, ctx: BodyContext): string {
  // Notion puts a stylesheet link before code blocks; a table of contents is the outline panel's job.
  for (const node of body.querySelectorAll("style, script, link, meta, nav.table_of_contents")) {
    node.remove();
  }
  equations(body);
  inlineDatabases(body, ctx);
  callouts(body);
  toggles(body);
  todos(body);
  for (const indented of [...body.querySelectorAll("div.indented")].reverse()) hoist(indented);
  code(body);
  columns(body);
  media(body, ctx);
  links(body, ctx);
  marks(body);
  mergeLists(body);
  breaks(body);
  return body.innerHTML;
}
