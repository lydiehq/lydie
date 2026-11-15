# AGENTS.md - @lydie/plugin-properties

Built-in plugin: typed properties (frontmatter) under a page's title, collapsible.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API; every change is an operation (undoable). A change that takes
  several operations is one `backend.transaction` (one undo step).
- The value editors are the shared ones in `@lydie/plugin-api/databases` (`PropertyEditor`,
  `PropertyValueView`), also used by the collection table.
- User-facing words: "collection", "page", "properties". Never show "database" or "row" (the code
  and operations keep their `database.*` names).
- Select elements in tests by role, label or test id.

## The decision this plugin implements

**Properties belong to collections.** A collection (a `database` in the code) is a page whose
sub-pages share properties and views; any page with sub-pages can become one. A page gets typed
properties by being in a collection; a page outside one gets no free-form custom properties from
the UI. Existing frontmatter is never lost or hidden (Lydie works on Obsidian vaults): a page that
has frontmatter keeps showing and editing it.

## What it does

A `documents` header slot (`properties`), hidden on collection pages. Four situations:

- **A page in a collection** (its parent is a database): the collection's properties in order;
  values through `database.setValues`; "+ Add property" (`database.addProperty`, with the
  catalogue below), rename, change type, delete from each property's menu. Computed values
  (relation titles, rollups, formulas) come from a view query filtered to the page's title.
  Frontmatter keys the collection does not list (`strayEntries`) show in a quiet group at the
  bottom, "Not in {Collection}", with inferred types, editable, renamable and removable by key
  (`doc.setProperties`), each with "Add to collection": `database.addProperty` with the **same key**
  and the inferred type (a list's values become its options), so every page's existing values under
  that key show without being rewritten. Keys the collection fixes (title `name`, `ctime`, `mtime`)
  or reserved prefixes (`file.` …) get no such action (`canAdopt`).
- **A page shared without its collection** (LYD-247: a guest receives the page and the collection's
  `database_properties`, not the collection or its views; `database.properties` live query): the
  definitions in order, values edited by key with `doc.setProperties`, no schema editing, no "Add
  property"; computed values are not available.
- **A page outside a collection with frontmatter**: "Properties", the frontmatter keys in order;
  types read from the values (`infer.ts`, as Obsidian does), with the last type chosen for a key
  remembered per device as the tie-breaker. Edit, rename (one `doc.setProperties` with set + unset),
  change type (`convertValue`), remove. No free add: "+ Add property" opens `CollectionPrompt`,
  which says properties are shared by the pages of a collection and offers:
  - with a parent page: "Make {Parent} a collection", stating "{Parent} will show its {n}
    sub-pages as a collection. Its text stays." On confirm, one transaction (`makeCollection`):
    `database.create { documentId: parent }`, a `database.addProperty` per key this page has (same
    key, inferred type), then the property the user named and typed.
  - at the top level: "Move to a collection…", a `PickerDialog` over `database.list`, then
    `doc.move` under the chosen collection (its keys then show under "Not in {Collection}").
  - in a connected folder (`useConnectedPage`: a GitHub repository's pages, marked by the
    publishing plugin): no prompt. The frontmatter is the file's own, set file by file for whatever
    builds the site (`sidebar`, `showTitle`), so "+ Add property" (`AddToPage`) adds a key to this
    page alone: name and type (`PAGE_TYPES`, no catalogue), `doc.setProperties` with the type's
    starting value, the type remembered for the key.
- **A page outside a collection with no frontmatter**: nothing, and no page-menu entry either: it
  gets properties by being moved into a collection or by making its parent one.

Page options (`icon`, `cover`, `cover-position`, `full-width`: `PAGE_OPTION_KEYS` in the plugin
API) are frontmatter but not properties: they never show here, in either group, and are never
adopted into a collection (`canAdopt`). Their own controls (page-decor, the page menu) set them.

Collapsed state is per device (`app.storage`).

### Look

Rows have the document tree's form, so the two read as one design: 30 px rows in 32 px slots,
`rounded-lg`, names in 13 px medium gray-600 with the type's icon (`TypeIcon`) in the tree's 20 px
icon box, gray-950/3 on hover and /5 while a row's popover is open, the tree's focus ring. Values
use the same box; a value's editor opens over it (`EditorPopover`, as the table's cells do),
spanning the row for typed values and at the picker's own width otherwise. The header is a sidebar section title ("Properties 3", `text-xs font-medium`, sentence case) with
the tree's caret (`CollapseArrow`). The panel bleeds 8 px into the margin so names line up with the
title. Menus and the add form: a name field, the types as an icon grid (`TypeGrid`), actions
with icons. If the tree's rows change, change `ui.tsx` with them.

### The catalogue (property reuse)

Adding a property to a collection (the row panel's "+ Add property" and "Make … a collection")
suggests properties other collections have whose name starts with what was typed ("Status · from
Projects · 4 options"); picking one copies name, type and settings (new option ids). Derived on
open from `database.list` and `database.get` (`backend.query`); nothing stored. Relations, rollups
and formulas are not suggested (their settings point at other properties).

## Layout

- `PropertiesPanel.tsx`: the slot, the four situations, `PropertyRow`, property menus.
- `CollectionPrompt.tsx`: the prompt, `makeCollection`, `MoveToCollection`.
- `PropertyForm.tsx`: name + type + catalogue suggestions.
- `ui.tsx`: the tree-row classes, `IconBox`, `TypeGrid`, menu parts.
- `collection.ts` (pure): stray keys, `canAdopt`, `adoptedProperty`, catalogue helpers.
- `infer.ts` (pure): types from values.

## Tests

`bun test`: `infer.test.ts`, `collection.test.ts`, `PropertyEditor.test.tsx` (the shared editors
in a DOM), `SharedRow.test.tsx` (LYD-247) and `Collections.test.tsx` (fake backend: nothing for a
loose page without frontmatter, frontmatter editable and no free add, "Make … a collection" as one
transaction adopting the keys, move into a collection, a key added to a connected folder's page,
"Not in …" and "Add to collection", catalogue suggestions). End to end: the "properties panel" test in
`apps/web/e2e/databases.e2e.ts`.
