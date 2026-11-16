# AGENTS.md - @lydie/plugin-versions

Built-in plugin: a page's history. Who worked on it (people and agents), and its versions.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API; no SQL, no filesystem, no git. What keeps the versions
  (snapshots, git, the hosted core) is the backend's business: the plugin calls `doc.listVersions`,
  `doc.getVersion` and `doc.restoreVersion` and never asks which.
- Select elements in tests by role, label or test id, never by styling classes.
- Permissions: `vault` (only folder windows keep versions) and `account` (a synced window reads
  who worked on a page from the hosted API).

## What it does

**Who worked on this** (`WhoWorked.tsx`, `contributors.ts`), in every window: a button at the top
right of the page (document "actions" slot, first) with up to three faces, newest first, and a
count of the rest. It shows only when someone besides you had a hand in the page: an agent, or
another person (you alone, or the system alone, shows nothing). Pressed, a popover lists everyone:
the avatar (`Avatar`, `BotAvatar` with the person an agent worked for, `LydieAvatar`; the
activity log's seeds), the name ("Claude Code for Maya", the person only when several could have
asked), what they did (`workOf`: "Created the page, edited, commented") and when; then "Version
history" (folder windows) and "All activity" (Settings → Activity). In the button's pile agents go
without the person badge. An agent that changed the page in the last two minutes, while it is the
newest, has a pen circling its face ("Writing now"). Data: `activity.list` with `targetId`, read
where the activity log reads it (a synced window through `account.callContract`, others on the
window's runtime), following `nextCursor` up to five pages of 100 (rows are coalesced, so that is
a very busy page); read again once edits pause for 2 s and when the signed-in user changes (a
synced window that read while signed out); an error (an older core) hides the button.
Names come from `workspace.members` (hosted), else "You". Tests: `contributors.test.ts` and
`WhoWorked.test.tsx` (markup through `react-dom/server`).

**Version history**: folder windows only (`app.services.vault`), until hosted and browser backends answer the same
operations. The right panel's "History" tab lists the open document's versions, newest first
(`format.ts`, unit-tested: who changed it, when). A version opens to its Markdown; "Restore this
version" asks first, then runs `doc.restoreVersion` on the tab's undo scope, so Cmd+Z takes it back.
The list reloads when the document's `updatedAt` moves. Command: "Show version history".

Which provider a folder uses is a folder setting (`versionHistory`), on Settings → Files & links
(the settings plugin).
