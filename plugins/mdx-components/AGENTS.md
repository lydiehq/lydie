# AGENTS.md - @lydie/plugin-mdx-components

Built-in plugin, experimental: shows the components of an MDX file as what they are.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus files inside this plugin). `client/scripts/check-boundaries.ts` is
authoritative and runs in CI.

## Rules

- **The document is never changed.** An MDX file opens as ordinary blocks: a component tag is a
  `rawBlock`, an `import`/`export` line is a paragraph. This plugin only decorates them
  (ProseMirror decorations: hidden nodes, widgets, classes). Saving a file that was only looked
  at writes the same bytes, with or without the plugin.
- Editing goes through the source: every region has a `</>` toggle that shows its raw block or
  paragraphs again, where they are edited as before.
- `parse.ts` is pure (no editor, no DOM) and unit-tested; `view.ts` builds the decorations and
  the widgets' DOM by hand (no React inside the editor's content).

## What it does

- `parse.ts`: `parseTag` (a block that is exactly one component tag: opening, closing or
  self-closing, capitalised names only, with string, expression and flag props), `regions`
  (module lines in a run; `<Name>` … `</Name>` with the blocks between, nested ones too; `<Name />`
  on its own; a tag without its partner is left alone), `constants` (`export const X = "…"`),
  `images` (props that are picture URLs or name such a constant), `toneOf` (info, warning, danger,
  success, neutral from the name and the `type`/`variant`/`icon` props), `readableName`.
- `view.ts`: the `MdxComponents` editor extension. A container gets a header (icon, its `title`
  prop or its name, its other props as pills) and a coloured rail down its blocks; a leaf gets a
  card, with the picture it points at above its name; module lines fold into an "MDX · 2 imports"
  chip. Top-level blocks only.

Not done: editing props in place, components inside list items or other blocks, inline components,
rendering a project's real components.
