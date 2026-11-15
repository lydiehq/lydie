# AGENTS.md - @lydie/plugin-import-notion

Built-in plugin: imports a Notion export (the HTML one) through Settings → Import and export.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- It only reads files into an `ImportPlan`; `runImport` (plugin API) writes it, through operations,
  in every kind of workspace. Never write documents here.
- User-facing words are the app's: collection and page for what is made; Notion's own words
  (database, property type) only for what the export holds.
- The parser (`read.ts` and what it imports) is loaded only when someone imports.

## What it does

`ctx.importers.register({ id: "notion", accept: [".zip", ".html"], read })`. The dialog's
instructions say how to export from Notion: HTML, everything, subpages.

`readNotionExport(files, context)` → `ImportPlan` (`rootTitle` "Notion"):

- Files (`importEntries` with `stripRoot` "Export-<uuid>/"): Notion's zip holds a zip per part.
  A Markdown & CSV export is refused with `MARKDOWN_EXPORT` (it loses property types and
  relations); index.html and databases' `.csv` copies are skipped.
- First pass (`page.ts`, `readPage`): title (`<title>`, untruncated), emoji icon, cover, a row's
  `table.properties` (`PropertyCell`: Notion type from `property-row-<type>`, text, options with
  colours, checkbox, links, `<time>`s, people), a database page's `table.collection-content`
  (columns with their type icon, rows in order; a database page has no `.page-body`), inline
  database tables, and the order sub-pages are shown in.
- Tree: "<title> <32 hex>" files and folders (`names.ts`). A folder whose id has no page is an
  inline database (its rows have properties) or a plain page (a teamspace); one such folder
  alone at the top is dropped. A page is a database when it has a table or rows. Siblings follow
  the parent's order (links to sub-pages, a table's rows), then titles.
- Databases (`schema.ts`, `buildDatabase`): property order from the table, then the rows (an
  order-keeping merge); the title's name is the column the rows leave out. Types: text, number
  (percent, currency or commas from how values are written), select, multi-select, status
  (groups guessed from option names, listed to do → in progress → complete), date (time and range
  flags from the values; `dates.ts`, day-first inferred from the export), checkbox, url, email,
  phone, files (export files become `importFileRef`s), relation (to the database most linked
  rows belong to; none in the export: text), unique id (prefix from "TASK-12"). People become a
  multi-select of names, created/edited by text, created/edited time dates, formulas and rollups
  their results (number, checkbox, date or text); each with one warning per property.
- Second pass (`body.ts`, `prepareBody`): the body in the editor's HTML, then
  `app.editor.fromHtml`. Callouts (kind from the icon), toggles (foldable callouts; toggle
  headings are headings), to-dos (task lists), equations (TeX from KaTeX's annotation), code
  languages, columns, images and files of the export (embeds of `importFileRef`), links to pages
  (wiki links to `importLink`, also notion.so addresses), inline databases (embeds of
  `importDatabaseEmbed`), background highlights (text colours dropped), and Notion's quirks:
  one list per item merged, `div.indented` unwrapped, a stray break before formatting removed,
  two breaks split a paragraph. A body that fails to convert is left empty with a warning.

## Tests

`bun test`: `names`, `dates`, `body` (each transform on export-shaped HTML), `read` (a small
export with an inline and a full-page database, relations, files, the Markdown & CSV refusal,
a lone teamspace folder) and `fixture` (Obsidian Importer's real test export,
`test/fixtures/notion-testspace.zip`, MIT, see `test/fixtures/LICENSE`, read from its zip).
The editor conversion and `runImport` are tested in @lydie/app.

## Not yet

Notion's API (OAuth) import, which keeps views, formulas and comments; the Markdown & CSV
export; two-way relations (imported as two one-way relations); linked views of databases outside
the export (kept as a table).
