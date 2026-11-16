# AGENTS.md - @lydie/plugin-import-markdown

Built-in plugin: imports a folder of Markdown files (an Obsidian vault, a Lydie export) through
Settings → Import and export.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- It only reads files into an `ImportPlan`; `runImport` (`@lydie/plugin-api/import`) writes it. Never write
  documents here.
- Bodies are changed only where they embed an imported file, through `app.editor.fromMarkdown` /
  `toMarkdown`, so everything else keeps its bytes.

## What it does

`ctx.importers.register({ id: "markdown", accept: [".zip", ".md", ".markdown"], read })`.

`readMarkdownFiles(files, context)` → `ImportPlan` (`planFromEntries`):

- Everything inside one folder (a zipped vault): that folder is the root page's title.
  Otherwise the zip's name, or "Markdown".
- `.md` / `.markdown` files are pages, titled by file name; folders with notes in them are pages;
  a note named like its folder, beside it (`Projects.md`) or inside it (`Projects/Projects.md`),
  is that page. Siblings by title. Hidden files and folders (`.obsidian`, `.lydie`) are skipped.
- Frontmatter (`app.editor.splitFrontmatter`) becomes properties; a UUID `id` (a Lydie export's
  own) is dropped, values a document cannot hold are left out with a warning, a `cover` that
  names an imported file points at it.
- Other files are attachments. Embeds (`![[photo.png]]`) and images alone in a paragraph
  (`![](assets/photo.png)`) that resolve to one, by path from the top, path from the note, or a
  name found once, become embeds of `importFileRef` (`rewriteAttachments`). Links between notes
  stay as written and resolve by title.
- `.base` and `.canvas` files are left out with a warning.

## Tests

`bun test`: `read.test.ts` (folders and folder notes, frontmatter, files, `.base` warning, no
notes; `rewriteAttachments`).

## Not yet

Collections from `.base` files (and a Lydie export's `.lydie/` order and ids).
