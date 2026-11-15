# AGENTS.md - @lydie/plugin-threads

Built-in plugin: comments beside a document, in the margin as in Google Docs (plan §3,
"Threads"; LYD-109, LYD-399).

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery("thread.list")`, `useOps().thread.*`); no SQL, no
  filesystem.
- A thread never changes the body. In the editor it is a decoration, not a mark: nothing about
  it is saved in the document.
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

To a person there are only comments. The model's `kind` stays (an agent's `note` is context that
never asks for an answer, and will not notify once mentions exist), but the UI shows both alike
and people always create `comment`.

- **In the text** (`extension.ts`): each open thread with an anchor highlights its passage
  (`[data-thread]`, `data-thread-kind`); a click on it opens its card.
- **The margin** (`Margin.tsx`, `margin.ts`; mounted by the editor overlay `Layer.tsx`): an
  `<aside aria-label="Comments">` portalled into the editor's root, right of the text column.
  Each thread is a card level with its passage (`article`, "Comment by …"); cards never overlap
  (`stack`), and the open one sits exactly at its passage with the others moved up or down
  around it, as in Google Docs. Comments on the page, and ones whose passage is gone (shown with
  the quote and "No longer in the page"), sit at the top. A closed card shows the first message
  (three lines) and the reply count; a click or focus opens it: every reply, the reply field,
  Resolve and Delete. Messages are a small timeline: the author's avatar (`AuthorAvatar`, the
  activity log's: `Avatar`, `BotAvatar` with the person an agent acted for, `LydieAvatar`;
  `authorOf` in `people.ts` uses the same seeds) joined by a hairline. Escape closes it.
- **Room for it** (`marginGeometry`): the margin takes room on the right only while it has
  something in it, by setting `--doc-margin` on the doc view's scroll container (its right
  padding). The text column moves left only as far as the cards need. Below about 440 px of
  text beside cards the margin is avatar markers instead, and the open card and a new one float
  under their passage (`FloatingCard`, `role="dialog"`). Positions are written to the DOM
  directly on every edit and resize; a new card's transitions switch on two frames after it is
  first placed, so it does not glide in from the top.
- **Starting one**: the selection toolbar's "Comment" (`selectionActions`, `readOnly`: someone
  with comment access gets it in a read-only editor, a viewer does not), Mod+Alt+M ("Add a
  comment": the selection, else the page), or the top bar's "Comment on this page". The field
  (`section aria-label="New comment"` in the margin) takes focus as soon as it shows, and again a
  moment later if the toolbar's button took it as it went away. A new draft replaces an open one,
  with an empty field. An anchor is taken from the editor's text and sent with `exact: true`.
- **Anchors follow edits** (`text.ts`): a passage is mapped through every transaction; a thread
  whose passage is unknown is found by its quote (`findQuote` over `docText`, the document as one
  text with the position of every character). About 1.5 s after a local edit changed a passage's
  text, `thread.setAnchor` saves it (`history: false`). Changes from collaboration are not saved
  from here.
- **The top bar** (`documents` "actions" slot): a Comments button with the count of open
  threads, and a menu: "Comment on this page", "Show comments" (device setting `threads.shown`:
  highlights and margin) and "Show resolved (n)" (per tab, `store.ts`).
- Commands: "Add a comment" (Mod+Alt+M), "Show or hide comments".

## Not yet

- Folder workspaces: the plugin does not activate there until threads have sidecar files (LYD-400).
- Bodies are shown as plain text, not rendered Markdown. No editing of a sent message in the UI
  (`thread.edit` exists). No mentions or notifications (LYD-401).

## Tests

`bun --filter=@lydie/plugin-threads run test` (`text.test.ts`, `people.test.ts`,
`margin.test.ts`). In a browser: `bun run test:e2e:threads` in `apps/web` (`e2e/threads.e2e.ts`,
local mode: the margin, focus, a second draft, the page, hiding, a narrow page) and
`bun run test:e2e:threads:hosted` (`e2e/threads-hosted.e2e.ts`: a guest with comment access,
against the running core).
