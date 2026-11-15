# AGENTS.md - @lydie/plugin-sharing

Built-in plugin: the Share dialog and public links.

Licence: AGPL-3.0-only.

## May depend on

`@lydie/plugin-api` only (plus `react`, `react/jsx-runtime` and files inside this plugin).
`client/scripts/check-boundaries.ts` is authoritative and runs in CI.

## Rules

- Data only through the plugin API (`useQuery`, `useOps`, `app.services.account.call`); no SQL, no
  filesystem.
- Every user-visible action is an operation (contract or hosted API).
- Select elements in tests by role, label or test id, never by styling classes.

## What it does

Hosted windows only. A Share button at the top right of the page, before its ••• (document
"actions" slot; the user's access beside it when they cannot edit) and "Share…" in the document
menu open the Share dialog (`sharing.share`): people with access, grants on the page
(change level or remove), access inherited from pages above (with a link to the source), add
people / teamspaces / everyone by name or invite by email (a combobox: suggestions as you type,
members from the synced `workspace.members` rows, so only those the user may see, matched by any
word prefix of name or email, `src/match.ts`; arrows, Enter, Escape; a typed address is invited
unless the arrows picked a suggestion) (`share.invite`: member → grant,
account → guest, otherwise an invitation; teamspaces only while they show, `useTeamspacesShown`
from the plugin API, and a grant to the default one reads "Workspace" while they do not), the "restricted" switch, and public links
("Publish to web": optional password, expiry, subpages; the token is shown once; change and
revoke). Controls are disabled below full access.

Whether a page is on the web comes from the synced links (`doc.publicAccess`), so everyone who can
see the page knows: a blue globe before Share ("Published to web", or "… with <page above>" when a
link with subpages on a page above reaches it; it opens the dialog), and a line above the links in
the dialog, naming the page above with a link to it. The tree's globe is the document-tree plugin's. The public page `/s/<token>` is rendered by
`apps/web` (it needs no workspace).
