# AGENTS.md - @lydie/plugin-mermaid

Built-in plugin: Mermaid code blocks drawn as diagrams.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus files inside this plugin). `client/scripts/check-boundaries.ts` is
authoritative and runs in CI. The renderer (Pele) is @lydie/editor's dependency, reached through
`mountDiagram` from `@lydie/plugin-api/editor`.

## Rules

- **The document is never changed.** A diagram is a `codeBlock` whose language is `mermaid` (or
  `mmd`), as Obsidian and GitHub write it. The plugin only decorates it: a widget with the drawing
  before the block, and the block hidden while its code is not being edited.
- The drawing is the renderer's SVG as it is (no scripts, no HTML in it). The parser's message for a
  diagram that does not parse is shown as text, never as HTML.

## What it does

`view.ts`: the `Mermaid` editor extension. `diagramBlocks(doc)` finds the diagrams at any depth.
Each gets a frame with its drawing, fitted to the editor's width, in the theme's colours (the
`--pele-*` variables are set from the theme's, so light and dark need no redraw). "Edit" (on hover,
bottom right) shows the code under a live preview; "Done" hides it. An empty diagram or one that
does not parse shows its code and, for the latter, the parser's message. The renderer loads when a
document first has a diagram, one chunk per diagram type.

`index.ts`: the plugin, and the slash menu's "Diagram" item (a starter flowchart).

Not done: an e2e test, exporting a drawing as an image, drawing diagrams on share pages and in
published output.

Drawing is asynchronous: a diagram drawn before keeps its last height (by source, in memory) while
it is drawn again, so a page opened again does not grow under the reader.
