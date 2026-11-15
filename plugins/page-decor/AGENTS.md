# AGENTS.md - @lydie/plugin-page-decor

Built-in plugin: page icons and covers.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `backend.query`); no SQL, no filesystem.
- Every user-visible action is an operation defined with `defineOperation` in `@lydie/contract`.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

- Stored as frontmatter properties so files stay portable (keys in the plugin API: `PAGE_ICON_KEY` "icon", `PAGE_COVER_KEY` "cover", `PAGE_COVER_POSITION_KEY` "cover-position" 0–100). Set with `doc.setProperties` (undoable).
- A `documents` slot "top" (above the title): the icon (click: emoji grid or any typed emoji, Remove) and the cover (on hover: Colour, Remove, and Reposition for an image: drag, then Save position).
- "Add icon" and "Add cover" (whichever is missing) are a row of buttons above the title, hidden until the pointer is on the row, the cover or the title (`data-page-title`, set by the doc view; a `:has()` sibling selector on the slot's root), as in Notion. The row lies in the room the title already has above it (negative margin, shifted down), so it adds no height. It stays shown while one of its pickers is open (`picking || coloring`): keep that when adding a picker.
- The same pickers open from the page's ••• menu (`documentMenu`, also the sidebar's row menu) and the palette: "Set icon" and "Set cover" (`openPicker`); the page opens first when it is not on screen. Nothing is written until something is picked.
- The app only sets colour covers for now (a swatch from `COVER_COLORS`, stored as its name: `cover: blue`): no upload, no URL. An image cover written by hand in the frontmatter still shows.
- A cover is a colour when `coverFillOf(cover)` says so: a palette name (theme-following class) or a hand-written hex (`cover: "#e8d5c4"`). Anything else is an image.
- The icon row follows the page's width (`pageColumnClass(pageFullWidthOf(properties))`), so it
  lines up with the title on full-width pages; the cover always spans the view.
- The icon shows wherever `DocIcon`/`pageIconOf` from the plugin API are used: tabs, quick switcher, link previews and embeds (the document tree still draws its own glyph: requested change).
