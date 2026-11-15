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
- A `documents` slot "top" (above the title): the icon (click: the design system's `IconPicker`, doodles in a colour or any emoji, found by one search; a doodle is kept as `icon: doodle:star:blue`; picking another colour recolours the current doodle without closing; Remove) and the cover (on hover: Colour, Remove, and Reposition for an image: drag, then Save position).
- "Add icon" and "Add cover" (whichever is missing) are a row of buttons above the title, hidden until the pointer is on the row, the cover or the title (`data-page-title`, set by the doc view; a `:has()` sibling selector on the slot's root), as in Notion. The row lies in the room the title already has above it (negative margin, shifted down), or above the icon when there is one (the icon sits 16 px above the title, with or without a cover), so it adds no height. It stays shown while one of its pickers is open (`picking || coloring`): keep that when adding a picker.
- The same pickers open from the palette: "Set page icon" and "Set page cover" (`openPicker`); the page opens first when it is not on screen. Nothing is written until something is picked. They are not in the document menu (the sidebar's row menu, the page's •••) on purpose.
- The app only sets colour covers for now: no upload, no URL. A swatch from `COVER_COLORS` is stored as its name (`cover: blue`); the last swatch (a rainbow, or the colour itself when the cover is one) opens the system's colour picker and stores a hex (`cover: "#3b82f6"`), written once the picker closes; meanwhile the cover follows the picker live (`preview` in `PageDecor`, which also draws a cover while adding one, and stays until the write lands; closing the popover drops it). Swatches are round. An image cover written by hand in the frontmatter still shows.
- A cover is a colour when `coverFillOf(cover)` says so: a palette name (theme-following class) or a hand-written hex (`cover: "#e8d5c4"`). Anything else is an image.
- The cover carries `data-page-cover` and `data-cover-tone` ("light" | "dark"): how light it is
  under the doc view's top bar (its top 36 px), which then lies over it with ink to match. A colour
  (or the placeholder) by its computed background, an image by the strip it shows there at its
  `cover-position`, both averaged in a small canvas (relative luminance over 0.42 is light); left
  out when it cannot be read (a cross-origin image without CORS).
- The icon row follows the page's width (`pageColumnClass(pageFullWidthOf(properties))`), so it
  lines up with the title on full-width pages; the cover always spans the view.
- The icon shows wherever `DocIcon`/`PageIcon` from the plugin API are used: tabs, quick switcher, link previews and embeds (the document tree still draws its own glyph: requested change).
