# AGENTS.md - @lydie/ui

Design system: react-aria-components + Tailwind 4, ported from v1 (`v1/packages/ui`, plus the theme
from `v1/packages/web/src/styles/tailwind.css`). Licence: MIT.

## May depend on

nothing internal. `client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Components take props only: no app state, routing, data access, SQL, filesystem or `node:*`.
- No TipTap import. Editor chrome here is presentational; `@lydie/editor` supplies the behaviour and
  the host (later `@lydie/app`) wires the two together.
- One positioning approach: react-aria's own overlays. No tippy.js or floating-ui here.
- A button that shows only an icon has a tooltip: `<Button size="icon-…" aria-label>` shows its
  label by itself, a plain `<button>` goes inside `<WithTooltip label>`. The lint rule
  `lydie/icon-button-tooltip` (`client/scripts/oxlint-plugin.ts`) enforces it.
- Variants use `tailwind-variants` (`tv`); `compose()` in `components/utils.ts` replaces the cva beta's.
- Icons: MingCute (Apache-2.0, licence in `src/icons/MINGCUTE-LICENSE`), its default line style
  ("core-regular"). Add one to `src/icons/mingcute.tsx` by copying its `elements` from
  `@mingcute/icons` (`dist/styles/core-regular/<name>.js`); name it as `@mingcute/react` does
  (`settings-3` → `Settings3Regular`). Do not add an icon package. Solid icons (`...Filled`,
  core-filled) only where a filled glyph is the point, e.g. a selected state.

## Using it in an app

```css
/* the app's stylesheet: one import brings Tailwind 4, the theme, Inter and editor-content.css */
@import "@lydie/ui/styles.css";
@import "@lydie/editor/styles.css"; /* only if the app renders the editor */
```

`styles.css` contains `@import "tailwindcss"` and `@source "../"`, so Tailwind scans this package
from its own location; the app's own files are found by Tailwind's automatic detection. Do not add
a second `@import "tailwindcss"`. Dark mode is the `.dark` class on `<html>` (the settings plugin sets it;
`apps/web/public/theme.js` sets it before the first paint). When the install root is above the Vite
root (this monorepo), allow it in `server.fs.allow` or the Inter font 403s (see `apps/web`).

## Public API (`src/index.ts`)

- **Components** (`src/components`, react-aria wrappers): AlertDialog, Autocomplete(+Item,
  Section), Breadcrumbs/Breadcrumb, Button and LinkButton (one look,
  `buttonStyles`, also for plain elements that must look like a button: variant
  primary|secondary|ghost|destructive (primary is after Paper's app icon, in its hue, a good deal darker: cornflower fill,
  off-white label, a rim of light on top; the `button-primary` utility in `styles/index.css`, in our sizes and radii; destructive is ghost with red text); size xs..xl, icon-2xs..icon-xl, the same heights as
  Numina's buttons (sm 30px, md 32px, lg 36px; icon-2xs 20 to icon-lg 36); rounded;
  an icon without a `size-*` class takes the size's icon size, `data-icon="inline-start|end"` on it
  tightens that side's padding; `data-current` marks the selected item of a set, such as the open
  view; Button has isPending, LinkButton navigates; a Button at an icon size shows its `aria-label`
  as a tooltip, any Button takes `tooltip` (text, or `false` for none) and `tooltipOptions`
  { placement, offset, hotkeys, delay }; `hotkeys` are key caps, one list or one list per step
  of a sequence, shown as muted text after the label ("⌘K", "Ctrl+K", "G then H"); `KeyCaps`
  draws them elsewhere),
  Checkbox/CheckboxGroup, ComboBox(+Item, Section), ConfirmDialog (on Modal + Dialog, laid out
  like Numina's confirm; 16 px padding, 4 px under the title, 32 px above the buttons, the same
  in AlertDialog; controlled `request` + `onResolve(confirmed)`, type ConfirmOptions
  { message, detail?, confirmLabel?, cancelLabel?, destructive? (red button, warning tile) };
  keeps the last request rendered while it animates out; a click outside, Escape or Cancel
  cancels; the dialog takes focus and Enter confirms, so no button shows a focus ring until Tab;
  what `app.confirm` shows), ContextMenu (a menu at a point), Dialog,
  Disclosure(+Header, Panel, Group), Field parts (Label, Description, FieldError, FieldGroup,
  Input, TextArea; every field, Select's field variant and SearchField included, has Numina's
  input look (`../app`'s Input), `fieldSurfaceClass`: `surface-depth`'s hairline border and soft
  drop on `bg-surface`, the border stronger (`gray-950/12`) with focus and a soft red halo
  (`ring-3 ring-red-500/20`) when invalid; no focus ring on text fields (Select, a button, keeps
  it for the keyboard); disabled is `opacity-50`;
  heights and radii on the Button scale: `size="md"` 32px `rounded-lg` (default), `"sm"` 30px
  `rounded-md`, on Input, TextArea, TextField, SearchField and Select, so a field lines up with
  the buttons in its row; an Input inside a FieldGroup takes `groupedInputClass`), Heading, Link, ListBox/ListBoxItem/DropdownItem/DropdownSection
  (section titles in menus and dropdowns: `sectionHeaderClass`),
  Menu/MenuItem/MenuSeparator/MenuSection (MenuItem: `icon` before the label, `danger` in red,
  `indicator="switch"` shows a checkable item's state as a switch at the end instead of a check;
  Menu `popoverClassName`), Modal (motion as in Numina: backdrop fades 150 ms, dialog
  scales from 95 % over 200 ms on `ease-out-strong`, both ways, via react-aria's isEntering/isExiting;
  `@starting-style` does not work inside react-aria's overlay), NumberField, PickerDialog (modal search over a
  list: the command palette and quick switcher; ARIA combobox; items may carry an `icon` and
  `breadcrumbs`; `height="fixed"` keeps the list one height while typing; `onHighlight(item)` when the item
  Enter would choose changes, which the palette and quick switcher use to fetch a page ahead), Popover
  (Select, ComboBox and Menu open in it; motion as in Numina's popups, also on HoverCard: fades and
  scales from 97 % at the trigger, 150 ms both ways on `ease-out-strong`),
  FloatingCard (non-modal card anchored to a rect: hover previews, inline editors; placement
  bottom/top/right, `data-placed` once positioned for gliding between anchors), HoverCard +
  `useHoverCard` (React Aria's preview trigger, hover part only: opens after a rest, stays open
  while the pointer moves onto the card, swaps at once between triggers, a press or Escape closes
  it; the rest starts only once the pointer really moves on the trigger, so a trigger that scrolls
  or shifts under a still pointer does not open one, and a key press other than a modifier puts it
  away until the pointer moves again; the trigger gets only a ref and pointer handlers, so it keeps its own role; timed apart from
  tooltips in `hover-card-state.ts`, so neither makes the other instant or closes it; `pause`/
  `resume` for controls inside the trigger that have tooltips), ProgressBar,
  RadioGroup/Radio (after shadcn's: a 16 px circle with a hairline edge, filled with the primary
  button's `button-primary` when selected, its dot in the button's label colour), SearchField, Select/SelectItem/SelectSection (`variant="field"`, the form
  control, or `"ghost"`, a ghost `sm` or `xs` Button with a chevron, for toolbars and rows of
  buttons), Switch (on, the track is `button-primary` and the handle the button's label colour;
  disabled is `opacity-50`, on or off),
  Tabs/TabList/Tab/TabPanels/TabPanel, TagGroup/Tag, TextField, Toolbar, Tooltip/TooltipTrigger
  (fades and slides 4 px in and out, as in React Aria's docs; closes at once when its trigger stops
  being drawn, such as hover-only row actions, instead of jumping to the window's top left),
  WithTooltip (`label` + one plain element such as a `<button>`; a Button takes `tooltip` instead),
  react-aria triggers for plugins: DialogTrigger, MenuTrigger, SubmenuTrigger, AriaDialog, Pressable.
  Helpers: `focusRing`/`focusRingClass` (the one focus ring: 2 px blue-600, 2 px out),
  `focusRingInsetClass` (drawn inside, for rows and cells in clipping containers), `focusRingFor`
  (for the box of a control whose focus is on a hidden input), `composeTailwindRenderProps`,
  `compose`. `styles/index.css` draws the same ring on any focusable element that sets no outline
  of its own; a scrolling row of buttons takes `-m-1 p-1` so the ring is not clipped.
- **Layout** (`src/layout`): `useElasticPanel` + `ElasticHandle` (a panel whose edge is dragged
  with rubber-banding and springs and collapses past its minimum: the sidebar, the right panel,
  the collections page drawer; motion in `layout/elastic.ts`), `sidebarSectionTitleClass` (every sidebar section title: sentence case,
  `text-xs font-medium`, never uppercase), `sidebarItemStyles`/`sidebarItemIconStyles` (the `h-[30px]
  rounded-lg` recipe), Separator, CollaborationCaret + `renderCollaborationCaret`/
  `renderCollaborationSelection`/`useUserColor`.
- **Identity** (`src/identity`): the shape says what kind of thing it is (a person is a circle,
  a place a squircle), the surface who drew it (people and places on paper, machines on a screen,
  Lydie in its green). `Avatar` (a person: `seed` = their user id; their `image` if they have one,
  else `ScribbleIcon` on a circle; takes `style`), `SpaceIcon` (a workspace, teamspace or app:
  its `image` cut to the squircle in SVG if it has one, else `ScribbleIcon` on a squircle;
  workspaces are seeded by name, because a desktop folder's id in the switcher is not its
  workspace id; new accounts and cloud workspaces get a random doodle as their `image` from the
  core, so the seeded one is only a fallback), `AvatarEditor` (`AvatarEditor.tsx`: a picture at
  96 px with "Choose a doodle" and "Draw your own"; props `seed`, `image`, `shape`, `title`,
  `description`, `onSave(image)` (a rejection keeps the editor open), `readOnly`; the
  account's avatar and a workspace's picture), `BotAvatar` (an MCP client, API token or the CLI:
  `logo` if it has one, else `ScribbleIcon` with `ink="screen"`; `behalf` puts the person it
  worked for in a cut-out at the bottom right), `LydieAvatar` (the system: the white mark on the
  brand green), `LydieMark` (the mark in `currentColor`; LoadingState spins it). `ScribbleIcon`
  (`Scribble.tsx`; the doodles and pictures without React are `scribbles.ts`, also exported as
  `@lydie/ui/scribbles` for the core): one of ten pen doodles, `SCRIBBLES`, as one wobbly stroke in one of
  `SCRIBBLE_PENS` on `SCRIBBLE_PAPER`, or with `ink="screen"` in one of `SCRIBBLE_LIGHTS` on
  `SCRIBBLE_SCREEN`; round or a squircle; `scribbleFor(seed)` picks the doodle and pen; the line
  is about 1.3 px at any size. `scribbleImage(choice, shape?)` and `drawnScribbleImage(strokes,
  pen, shape?)` make a picture as an SVG `data:` URL (to save as someone's or a workspace's
  image), round unless `shape` is "squircle"; `randomScribbleImage(shape?)` is a random doodle and
  pen as such a picture; `ScribbleCanvas` draws one with the pointer (also
  takes `shape`); `scribbleOutline(shape)` is the outline's path. `cut.ts` holds the canonical
  mark, `MARK_PATH` and its two
  `MARK_PIECES`, written by the brand's build script: draw the mark from it, never regenerate it
  (an approximation lost the tips' fillets). `MARK_SHAPE` is the band's numbers, for cutting
  other outlines: `cutOutlinePieces` cuts any closed outline with the same true fillets,
  `cutEdge` is a band's edge curve, `SQUIRCLE_PATH` the 100-box squircle. `cutFor(seed)` gives
  one of eight turns and two of `CUT_COLORS` (the playground's mark-based avatars).
- **QrCode** (`src/components/QrCode.tsx`): `value`, `label`, `size`; an `<img>` of an SVG built
  with `uqr`, dark on white in both themes.
- **Settings** (`src/layout/Settings.tsx`): SettingsSections, SettingsSection, SettingsCard,
  SettingsRow, SettingsCardHeader, SettingsCardBlock, SettingsCardEmpty, SettingsListItem (whole
  item is one button with `onPress`), SettingsDetailsPanel (non-modal, right of the settings
  content; registers with `SettingsEscapeContext`/`createEscapeStack` so Escape closes it first),
  SettingsDetailsList, useSettingsSave + SettingsSaveStatus, SettingsTextInput (saves on blur or
  Enter, Escape reverts). `Modal` has a `size="screen"` for the settings window. Section titles
  sit on the page's text edge and boxes bleed into the gutter by their padding plus border
  (`settingsBoxBleedClass`, on SettingsCard; add it to other boxes in a section), as in Numina.
- **Illustrations** (`src/illustrations/`): isometric line drawings for empty states, one per state
  (TrashIllustration, SearchIllustration, NoResultsIllustration, NoDocumentIllustration,
  VersionsIllustration, NoHeadingsIllustration, BacklinksIllustration, SyncIllustration,
  BoardIllustration, NoAccessIllustration, NotFoundIllustration, FirstDocumentIllustration,
  TemplatesIllustration; MarkIllustration, the mark's two pieces lying flat, one dropped after
  the other, not used yet). `views.tsx`: one per collection view type (TableViewIllustration,
  BoardViewIllustration, ListViewIllustration, CalendarViewIllustration,
  GalleryViewIllustration), each lying flat in the same footprint, for the "New view" menu.
  `size` is `md` on a page, `sm` in a side panel, `xs` beside a label in a menu (36 px, its
  strokes at 60 %: they are in screen pixels, so the kit's pieces scale them through `useLine`,
  and a drawing's own `strokeWidth` should too); `className` overrides
  (tailwind-merge). Solid objects in ink on paper, grey thickness, dashed outlines for what is
  missing; every tone is mixed from `surface` and the gray ramp, so dark mode follows. `kit.tsx`
  draws flat shapes on three planes given thickness (`Solid`, `Dashed`, `Rise`, `Enter`); the
  entrances use `motion` through `LazyMotion` + `m`, with `domAnimation` loaded on first use
  (`motion-features.ts`: about 14 kB gzip at startup instead of 31 kB), and keep only the fade
  under reduced motion. Tests that render one set `MotionGlobalConfig.skipAnimations` in
  their setup: happy-dom leaves a cancelled animation's rejection unhandled. Every drawing is in
  the dev playground's "Empty states" (`apps/web`).
- **SidebarNotice** (`src/layout/SidebarNotice.tsx`): a small card at the bottom of the sidebar
  (title, a line or two, at most two actions, dismiss), for what should not take room in the
  content: the beta notice, the account plugin's local notice.
- **UI states** (`src/layout/States.tsx`): EmptyState (`illustration` above the title, or a
  small `icon`), LoadingState (hidden for its first 150 ms too, `animate-appear`; its indicator is
  `identity/RollingMark.tsx`, "Roll" from the logo brainstorm: the mark as a ball cut by a slab,
  rolling forward along the band once in 2.6 s, painted per pixel on a canvas in `currentColor`;
  the resting mark under reduced motion), Skeleton (one bar, sized by
  `className`; `animate-skeleton` keeps it hidden for 150 ms, so quick loads show nothing, then
  fades in and pulses; prefer a skeleton in the shape of the content over LoadingState where the
  layout is known), ErrorState, StatusBanner
  (info/offline/syncing/conflict/warning/error; `variant="bar"` across the top of a view,
  `"card"` boxed inside content), SyncIndicator (local-only, signed-out,
  auth-expired, offline, connecting, syncing, synced, error; pending/conflict/rejected counts).
- **Timeline** (`src/layout/Timeline.tsx`): `Timeline` (an `<ol>`) of `TimelineEvent` { icon (an
  `Avatar` size 20 or an icon, in a 20 px column joined to the next event by a hairline), actor?,
  action (muted after the actor), timestamp (ISO; at the right in `timeFormat` "relative" | "time"
  | "date", the full date in a tooltip), details?, now? }; `formatTimelineTime`,
  `formatTimelineDate`. After Numina's timeline; the settings plugin's Activity page uses it.
- **Editor chrome** (`src/editor`, props only): EditorBubbleToolbar (v1's dark selection bar),
  EditorToolbar (light top bar), BlockTypeSelect, LinkField, CommandList (the `/` and `[[` menus),
  CodeLanguagePicker, DragHandleGrip (`label` shows e.g. "H2" in place of the grip until the
  handle is hovered), TableHandleMenu (the grip pill on a table's row or column and its Menu,
  sections split by separators; fills `@lydie/editor`'s `renderTableHandle`; type
  TableHandleMenuAction); types EditorToolbarAction/Item, BlockTypeOption,
  CommandListItem.
- **Icons**: v1's document icons, drawn in CSS (spans, so they sit inline): DocumentThumbnailIcon
  (a page with lines; `showFoldDecoration`: a page with sub-pages, a shorter page with another
  popping out up and to the right) and CollectionItemIcon (a collection: a small table, header row
  over cells). Both are drawn on `bg-paper` (white; #2e2e2e in dark mode, lighter than the sidebar) with `shadow-surface` for the edge and 25-30% gray-950 ink. `DocIcon` in plugin-api picks between them.
  CollapseArrow: v1's filled caret (the tree's and the properties panel's expand/collapse).
  Plus ~100 vendored MingCute icons (`src/icons/mingcute.tsx`,
  `AddRegular`, `FileRegular`, `Search2Regular`, `Heading1Regular`, …; types `Icon`, `IconProps`).
  The drag grip is `DotsVerticalRegular` turned 90°. `@lydie/editor`'s callout inlines MingCute's
  "information" and "right" paths (it cannot import this package).
- **CSS**: `@lydie/ui/styles.css` (theme tokens: neutral oklch grays, `surface` and `elevated`,
  Inter Variable, 13 px `--text-sm`, shadows surface/container/popover/document-icon/depth, colour `paper`; checkbox
  animation; `icon-muted` utility; `surface-depth` utility (Numina's: a hairline `--depth-border`,
  `bg-clip-padding` and the layered `shadow-depth`; dark values in `dark.css`), used by secondary
  buttons (`bg-elevated`, `hover:border-gray-950/12`) and the shell's cards; `scroll-fade.css`,
  shadcn's scroll-fade utilities, vendored (MIT): `scroll-fade` / `scroll-fade-x` on the element
  that scrolls fades an edge only while there is more that way (default depth min(8%, 24px), set in `index.css`), `scroll-fade-b` the bottom only
  (menus and dropdowns, whose section titles stick to the top), `scroll-fade-<n>` the depth; it is
  a mask, so backgrounds, borders and shadows go on a wrapper (the sidebar trees and favorites,
  the settings navigation, the palette, menus, view tabs); `editor-content.css`, the document typography, including v2
  node types, tables (a rounded card: `separate` borders, hairline rules, tinted header row, at
  least the text column wide; a wider one starts at the text column and scrolls sideways across the
  editor's whole width, as a collection's table does) with their hover "+" bars, and block dragging (the blue drop line gliding between gaps, the dimmed source, the
  lifted preview card), typeset math (`[data-math-view]`, source only while `[data-editing]`) and
  to-do checkboxes drawn as CheckboxMark (`[data-checkbox-mark]`, from the editor's input
  `:checked`; keep it in step with `boxStyles` in `Checkbox.tsx`); `dark.css`, the dark theme).

## Colours and dark mode

Floating surfaces take their edge from one of two shadows, both Numina's (`../app`): `shadow-popover`
(its `shadow-md ring-1 ring-border`) for popovers, menus, hover cards and suggestion lists, and
`shadow-dialog` (`shadow-lg`, same ring) for modals. The 1 px hairline is part of the shadow: do not
add `ring` or a border beside them. The one exception is `shadow-lift`, a drop shadow with no
hairline, for a value lifted out of its place to be edited (`EditorPopover` in plugin-api: table
cells and properties).

Write light-mode classes only; `dark.css` makes the colours follow the theme. Under `.dark` the
gray ramp is mirrored, `surface`/`elevated` turn dark, and each colour's 50-300 become tints and
700-950 take the light end's values (400-600 are unchanged), so `bg-blue-50 text-blue-700` keeps
working. So:

- Backgrounds: `bg-surface` for pages, cards and inputs (never `bg-white`); `bg-elevated` for
  popovers, menus, dialogs, toasts and floating cards; `bg-canvas` for the window behind the
  content cards (the shell, standalone pages): the avatars' warm paper, `#212121` in dark mode.
  `apps/web/public/boot-shell.js` and the desktop window's `backgroundColor` repeat it.
- Neutral overlays, borders and rings: `gray-950/N` (e.g. `hover:bg-gray-950/5`), never `black/N`.
- Text on a solid dark-gray chip or button: `text-surface`, not `text-white`.
- Solid colour fills and their hover stay within 400-600, which do not change
  (`bg-blue-600 hover:bg-blue-500`). A 700+ hover would turn light in dark mode.
- `white` and `black` are literal and do not change: keep them for text on coloured buttons
  (`bg-blue-600 text-white`) and for deliberately dark UI (tooltip, bubble toolbar, backdrop).
- Do not add `dark:` variants for theme colours (they would flip twice). `dark:` is only for
  literal colours, e.g. the modal backdrop's `dark:bg-black/50`. Put `dark` on an element for a
  dark island (the bubble toolbar).
- Hex colours, `rgb()` and `zinc`/`slate`/`neutral` do not follow the theme; use the tokens. The
  one exception is `CUT_COLORS`: an avatar is a picture and keeps its colours in both themes (its
  cuts show the surface, its tile is a translucent `color-mix`).
- Edges of floating things (toasts, popovers, menus, cards): `ring ring-gray-950/10`, never
  `border`, with a Tailwind shadow (`shadow-xl` for toasts). A ring sits outside the box like the
  shadow does, so the two read as one edge.

## Not ported from v1, or removed since

Removed as not needed by a writing app yet (bring back from v1 when a feature needs them): the colour
components (ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker,
ColorThumb, ColorWheel), the date and time components (Calendar, RangeCalendar, DateField,
DatePicker, DateRangePicker, TimeField), Slider, Meter, CircularProgress, the data Table,
GrainyGradientBackground with its CSS, and the `COLORS` palette.

Removed on 2026-11-13 because the app shell and its virtualised tree replace them or nothing uses
them: SidebarShell, Drawer, GridList, Tree (react-aria's, not virtualised), ToggleButton,
ToggleButtonGroup, Eyebrow, SectionHeader, DocumentIcon. (v1's CollapseArrow is back, as the
filled caret of the document tree and the properties panel.)

Collections (CollectionItemIcon, MetadataTabsShell), the marketing ShowcaseSidebar, the
`.editor-content-sm` variant (only used by AI chat previews) and the template-field placeholder
styles. `motion` (used for one button spinner, now CSS) and `@fluentui/react-icons` are gone.

Replaced on 2026-11-13 by MingCute: v1's Fluent icons and its hand-drawn editor icons (H1Icon…
BlockquoteIcon, now `Heading1Regular`, `BoldRegular`, `QuoteLeftRegular`, …).

## Tests

`bun test`. `test/setup.ts` (preloaded via `bunfig.toml`) registers happy-dom globally.
`src/ui.test.tsx`: Button variants and spinner, `compose`, CommandList, bubble toolbar.
