# AGENTS.md - @lydie/plugin-team

Built-in plugin: members, invitations and the sidebar's sections (teamspaces) of a hosted workspace.

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

Teamspaces are hidden for the alpha (`TEAMSPACES_UI` in `@lydie/plugin-api`, `src/teamspaces.ts`,
is the one switch): a hosted workspace shows two sidebar sections, "Workspace" (the default
teamspace, which every member joins) and the person's "Private". They come back on their own in a
workspace that already has another teamspace (`teamspacesShown`: more than one teamspace, or one that
is not the default; made before they were hidden, or through the API), so no page loses its place.
Every teamspace condition below reads `useTeamspacesShown()` (components) or `shown()` (the
plugin's own `workspace.teamspaces` live handle, for the synchronous menu and settings checks).

Settings pages (group "Team"; an explanation with "Copy to cloud…" in local windows):
Members (list with roles; details panel at `/settings/members/<userId>`: change role, remove,
leave, transfer ownership; invitations: invite by email with a role, pending list, resend,
revoke; while teamspaces show, invitations can add the person to the other teamspaces) and
Teamspaces, in the navigation only while they show (create with visibility; details at
`/settings/teamspaces/<id>`: rename, visibility, members and their roles, add/remove, join/leave,
delete; admins see deleted teamspaces and restore them). In the document menu for top-level pages
(`doc.moveToSpace`): "Move to Workspace or Private…", or "Move to teamspace…" while teamspaces show;
one dialog that starts on a space the page is not in. The sidebar's sections in hosted windows
(`SpacesTree`, in place of the flat tree): each teamspace the user is in (the default one named
"Workspace" while hidden), Private, and "Shared with you" when something is; "+" on a section
creates a page in it (`doc.create` with `teamspaceId`), and dropping a page on another section
moves it there.

All data through `app.services.account.call` (`useHostedQuery`); changes are optimistic and
reload on failure. The member and invitation lists are fetched again when the synced
`workspace.members` rows change (an invitation accepted elsewhere, someone leaving, a role
changed) and when the window regains focus or is shown again (`useRefreshOnMemberChange`,
`src/refresh.ts`; LYD-420). The invitation accept page (`/invite?token=`) is in `apps/web` because it runs
before any workspace opens.
