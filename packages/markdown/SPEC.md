# Lydie Markdown

The file format of Lydie documents, and how `@lydie/markdown` maps it to and from the ProseMirror
document the editor works on. The goal is that Lydie can open any existing Obsidian vault and never
damage a file: bytes Lydie did not change are written back exactly.

## Dialect

Lydie Markdown is CommonMark 0.31.2, plus:

| Extension         | Syntax                                                                                | Notes                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GFM tables        | `\| a \| b \|` / `\| --- \| :-: \|`                                                   | Cells hold inline content. `\|` escapes a pipe, also inside code and wikilinks.                                                                                      |
| GFM task lists    | `- [ ] todo`, `- [x] done`                                                            |                                                                                                                                                                      |
| GFM strikethrough | `~~text~~`                                                                            | Double tilde only. A single `~` is text (as in Obsidian).                                                                                                            |
| GFM autolinks     | `https://x.com`, `www.x.com`, `a@b.co`, `<https://x.com>`                             |                                                                                                                                                                      |
| GFM footnotes     | `text[^1]` and `[^1]: note`                                                           | Obsidian's inline `^[note]` is plain text.                                                                                                                           |
| YAML frontmatter  | `---` on the first line, closed by `---` or `...`                                     | Returned as properties, never part of the body. An optional BOM may precede it.                                                                                      |
| Wikilinks         | `[[Note]]`, `[[Note\|alias]]`, `[[Note#Heading]]`, `[[Note#^block-id]]`, `[[#Local]]` | No line breaks inside. In tables the alias separator is written `\|`.                                                                                                |
| Embeds            | `![[file.png]]`, `![[file.png\|300]]`, `![[Note#Heading]]`                            | A paragraph made only of embeds becomes embed blocks.                                                                                                                |
| Callouts          | `> [!kind]` + optional `+`/`-` fold + optional title                                  | Any blockquote whose first line matches. Kind keeps its case.                                                                                                        |
| Highlight         | `==text==`                                                                            | Exactly two `=`, flanking rules as for `~~`.                                                                                                                         |
| Comments          | `%%text%%` inline (may span lines), and `%%` blocks starting a line                   | A block comment may contain blank lines and must close with `%%` at a line end.                                                                                      |
| Tags              | `#tag`, `#nested/tag`                                                                 | Plain text in the document; found by `extract`. Must contain a non-digit.                                                                                            |
| Block ids         | `text ^id`, or `^id` on its own line after a list, table or quote                     | Plain text in the document; found by `extract`, added by `assignBlockId`.                                                                                            |
| Math              | `$x$` inline, `$$` fenced blocks                                                      | Inline: no space after the opening `$`, none before the closing `$`, the closing `$` not followed by a digit or preceded by `$` (so "$5 and $10" is text).           |
| Directives        | `:::name{key="value"}` … `:::`                                                        | Container directives only, nestable with longer fences (`::::`). Leaf (`::name`) and text (`:name`) directives are not syntax, so prose like "Note:this" stays text. |

Everything else that CommonMark allows (HTML, link reference definitions, reference links) is kept
verbatim (see "Raw fallbacks").

## Document mapping

| Markdown                             | Node / mark                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| paragraph                            | `paragraph` (soft line breaks stay `\n` in the text)                                                                                                                     |
| ATX / setext heading                 | `heading(level)`                                                                                                                                                         |
| bullet / ordered list                | `bulletList` / `orderedList(start)` of `listItem`                                                                                                                        |
| list where every item has a checkbox | `taskList` of `taskItem(checked)`                                                                                                                                        |
| blockquote                           | `blockquote`, or `callout(kind, title, fold)`                                                                                                                            |
| fenced / indented code               | `codeBlock(language)`; `language` is the whole info string (`js title="x"`)                                                                                              |
| `$$` block                           | `mathBlock`, LaTeX as text content                                                                                                                                       |
| thematic break                       | `horizontalRule`                                                                                                                                                         |
| table                                | `table` > `tableRow` > `tableHeader` (first row) / `tableCell`, each with one `paragraph`; column alignment in the cell's `align`                                        |
| `[^x]: …`                            | `footnoteDefinition(label)`                                                                                                                                              |
| `:::name{…}`                         | `directive(name, attrs)` with the attributes as a string map                                                                                                             |
| `::::columns` of `:::column` only    | `columnList` of `column(width)`; `width` from `{width="40%"}` (a number, percent), null without it. Any other attribute, a label or another child keeps it a `directive` |
| embed-only paragraph                 | one `embed(target, heading, blockId, alias)` per embed                                                                                                                   |
| `**x**` / `__x__`                    | mark `bold`                                                                                                                                                              |
| `*x*` / `_x_`                        | mark `italic`                                                                                                                                                            |
| `~~x~~`                              | mark `strike`                                                                                                                                                            |
| `==x==`                              | mark `highlight`                                                                                                                                                         |
| `` `x` ``                            | mark `code`                                                                                                                                                              |
| `[x](url "t")`, autolinks            | mark `link(href, title)`                                                                                                                                                 |
| `![alt](src "t")`                    | inline `image(src, alt, title)`                                                                                                                                          |
| `[[…]]`                              | inline `wikiLink(target, heading, blockId, alias)`                                                                                                                       |
| `$x$`                                | inline `mathInline`, LaTeX as text content                                                                                                                               |
| `[^x]`                               | inline `footnoteReference(label)`                                                                                                                                        |
| backslash / two-space line break     | `hardBreak`                                                                                                                                                              |

### Raw fallbacks

Constructs without a node of their own become `rawBlock(source)` or `rawInline(source)`, holding
the exact source. They are written back unchanged.

| Construct                                                                                        | Fallback                                        |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| HTML blocks, HTML inline                                                                         | `rawBlock` / `rawInline`                        |
| `%%` block comments, `%%` inline comments                                                        | `rawBlock` / `rawInline`                        |
| Link reference definitions `[a]: /url`                                                           | `rawBlock`                                      |
| Reference links and images `[a][b]`, `[a][]`, `![a][b]`                                          | `rawInline`                                     |
| An embed inside running text (`see ![[x.png]] here`)                                             | `rawInline`                                     |
| Inline display math `$$x$$`                                                                      | `rawInline`                                     |
| Math block with text after the opening `$$`                                                      | `rawBlock`                                      |
| Directive with a `[label]`                                                                       | `rawBlock`                                      |
| Checkbox of an item in a list that is not entirely a task list                                   | `rawInline` (`"[ ] "`) at the start of the item |
| A list item whose first child is not a paragraph (`- # heading`, `- ```code`)                    | the whole top-level block becomes `rawBlock`    |
| A multi-line raw construct nested inside a container, whose slice would carry container prefixes | the whole top-level block becomes `rawBlock`    |

## Serialisation

`serialize` writes canonical Lydie Markdown for content that has no source:

- ATX headings (setext only when a level 1–2 heading contains a line break), `-` bullets, `1.`
  numbering, two-space-free nesting (content indented under the marker), tight lists.
- `**bold**`, `*italic*`, `~~strike~~`, `==highlight==`, backtick code spans sized to their
  content, `[text](url "title")`, bare URLs where GFM autolinks them back, otherwise `<url>`.
- Fenced code with backticks (tildes if the info string contains a backtick), at least three and
  longer than any fence inside.
- Hard breaks as `\` + newline. Blocks separated by one blank line. A thematic break that would start
  the file is written `***` (`---` would open frontmatter).
- Escaping is contextual: a character is escaped only where it would otherwise start syntax.
- Two adjacent lists get different markers so they do not merge.

### Normalisation

Markdown cannot hold some editor states, so before saving the document is normalised (and the
result is what reading the file back gives): empty paragraphs are dropped (except the first child
of a list item and the only child of a container); whitespace at paragraph edges, around line
breaks and just inside emphasis delimiters is removed; line breaks at paragraph edges are removed;
table cells are single paragraphs without line breaks (a hard break becomes `<br>`).

## Splice-preserving save

`save` never re-serialises the whole file:

1. Frontmatter bytes are copied unless properties changed; then only the changed top-level keys are
   rewritten (added keys are appended, removed keys deleted), keeping comments, quoting and order.
2. The body's top-level blocks are aligned with the original by content fingerprint (Myers diff,
   pairing deleted and inserted blocks of the same type as edits). Unchanged blocks are copied
   byte for byte, together with the original gaps between them (blank lines, trailing whitespace,
   line endings).
3. A changed container (list, list item, task item, blockquote, callout, footnote, directive, columns) is
   spliced recursively: its unchanged children are copied, the container's own markers come from
   the original (a toggled task rewrites only `[ ]` → `[x]`, a callout title change only the header).
4. A changed leaf block is re-serialised with the original's style hints (bullet character, ordered
   delimiter, fence, emphasis and strong markers, hard-break style, indented code) and the original
   line prefixes (`> `, indentation) and line ending.
5. The result is parsed again and compared with the edited document. If it differs, save retries
   without recursion, then with blank lines around changed blocks, then with aggressive escaping;
   `verified: false` reports the rare case where none reads back exactly.

## Three-way reconciliation

`reconcile({ base, disk, doc })` handles a file that changed on disk while open:

1. `ours = save(base, doc)`: the editor state spliced onto the last agreed text, so its unchanged
   blocks are byte-identical to the base and do not create spurious differences.
2. `merge3(base, ours, disk)`: line-level diff3. Conflicting hunks are retried word by word, so edits
   to different words of one line (a paragraph is often one line) merge. When both sides only
   inserted at the same place, both insertions are kept (disk first).
3. A clean merge is parsed and diffed against the editor document block by block; each changed block
   yields the narrowest ProseMirror replace step (`findDiffStart`/`findDiffEnd`), so cursors and block
   ids elsewhere are untouched. Empty paragraphs in the editor are left alone.
4. Remaining conflicts are returned as text conflicts (base/ours/theirs) and as git-style marked text.

## Schema contract

`@lydie/editor` must use exactly these names and attributes (`src/schema.test.ts` pins them).

Nodes: `doc`, `paragraph`, `text`, `heading(level)`, `bulletList`, `orderedList(start)`, `listItem`,
`taskList`, `taskItem(checked)`, `blockquote`, `codeBlock(language)`, `horizontalRule`, `hardBreak`,
`image(src, alt, title)`, `table`, `tableRow`, `tableHeader(colspan, rowspan, colwidth, align)`,
`tableCell(colspan, rowspan, colwidth, align)`, `callout(kind, title, fold)`,
`wikiLink(target, heading, blockId, alias)`, `embed(target, heading, blockId, alias)`, `mathInline`,
`mathBlock`, `footnoteReference(label)`, `footnoteDefinition(label)`, `directive(name, attrs)`,
`columnList`, `column(width)`, `rawBlock(source)`, `rawInline(source)`.

Marks: `link(href, title)`, `bold`, `italic`, `strike`, `highlight`, `code`.

Additions and changes relative to the original brief, which the editor must mirror (it does, except
inline images and one-paragraph cells: LYD-156):

- `image` is **inline** (Markdown images are inline). TipTap's Image needs `inline: true`.
- `embed` has `target, heading, blockId, alias` (same as `wikiLink`); `alias` holds the `|…` part,
  which for images is the size (`300`, `100x200`). An editor that keeps only `target` drops the rest
  on the next save of that block.
- `tableHeader`/`tableCell` contain exactly one `paragraph` and carry `align` (`null`, `left`,
  `center`, `right`); `colspan`, `rowspan`, `colwidth` exist for prosemirror-tables and are not
  written to Markdown.
- `callout.title` and `callout.fold` are `null` when absent; `fold` is `"+"` or `"-"`.
- `mathInline` and `mathBlock` hold the LaTeX as text content (no `latex` attribute).
- `rawBlock`/`rawInline` have only `source`.
- `directive.attrs` is a string-to-string map.
- `columnList` holds `column+`; `column` holds `block+` and `width` (number, percent of the row, or
  `null` for an equal share). Written as `::::columns` / `:::column{width="40%"}`, fences lengthened
  for directives inside.
- `codeBlock.language` holds the whole info string.
- The `code` mark does not exclude other marks (``[`x`](url)`` and ``**`x`**`` are common).
- Soft line breaks are `\n` inside text nodes; the editor must keep them (`white-space: pre-wrap`).

## Known limitations

- Reference links, definitions and inline embeds are not editable as rich content (raw).
- A list item starting with a heading or code fence turns its whole list raw.
- Editing a link definition (raw) changes how other blocks parse; such edits are not local.
- GFM email autolinks next to `_`/`-` can read back differently after an edit of that paragraph
  (`gfm#631`).
- `>[!kind]Title` without a space after `]` is a plain blockquote.
- Parse speed is bound by micromark: about 2 MB/s.
