# AGENTS.md - @lydie/plugin-settings

Built-in plugin: the settings window.

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

The settings window (`overlay:settings`), opened by Mod+, (`core.openSettings`), from the workspace
menu, or a deep link `/settings/<page>/<path>` (web only, through the overlay's `url`: the open
page is the overlay's props, which the host keeps in the address bar; the URL follows the open page and Back
closes it). Layout after the owner's settings format: header (search, title, close), navigation of
contributed pages grouped by `SettingsPageDef.group` (`navigation.ts`, unit-tested), the page, and
an optional details panel (`SettingsDetailsPanel` from `@lydie/ui`). Escape closes the innermost
layer first. Closing fades out like the other dialogs: the Modal closes, and the overlay is
closed once the content has unmounted (`CloseWhenGone`); the host closing it (Back) is instant. Pages: General (a synced workspace's picture, `AvatarEditor` on a squircle saved with
`workspace.setImage`, owners and admins only; workspace name, theme, editor font size/line width/spellcheck, and on desktop a Privacy section, `PrivacySetting.tsx`: the app lock
(`AppLockSetting.tsx` over `app.appLock`: turn on, lock now, change, turn off, idle time, Touch ID)
and "Hide from screen sharing" over `app.screenCapture`), Keyboard shortcuts (record, conflict detection with "Use it here", clear, reset,
reset all, filter), Files & links (listed only in folder windows, `app.services.vault`: attachments folder, excluded
folders, link format and path, and what keeps version history (snapshots, git or off), kept in the folder's `.lydie/workspace.json`), Plugins (on/off
per device via `app.plugins`, applied on reload), Agents & API (local MCP server toggle under "On this computer", shown only in folder
workspaces, hosted MCP URL with copyable client configs (`mcp-snippets.ts`: API token or OAuth),
connected OAuth apps with Disconnect, hosted API URL, personal API tokens of the hosted workspace:
create with access (read and write, read only, or add to the inbox only: `inbox:write`) and
expiry, secret shown once and filled into the configs, revoke), Export and
backups (`pages/Export.tsx`: "Export workspace" runs `workspace.export` through `export.ts`, on the
hosted API for synced workspaces (`account.callContract`), else the window's runtime; a local
export shows its progress as a percentage on the button (`OperationOptions.onProgress`). A hosted
export's link and a backup's are saved with `app.download` (desktop: a save dialog; Chromium: the
file picker; then a toast with the saved name; other browsers: their own download), and the
button shows the download's progress (LYD-376): a percentage when the size is known (backups),
else the amount so far, since a hosted export is a zip made as it is sent (`ProgressButton`,
`downloadProgress`). A browser workspace's zip is a blob URL, clicked as a link. Synced workspaces also get automatic backups off/daily/weekly with the kept
zips (`backup.get`, `backup.setFrequency`, `backup.downloadUrl`); folder and browser workspaces
say in one line why there are none), Activity (group "Workspace", `pages/Activity.tsx`, LYD-304:
the workspace activity log, `activity.list`. Read where the workspace lives (`activity/source.ts`):
a synced window asks the hosted API through `account.callContract`, since its replica only has
this device's rows; folder and browser windows run it on the window's runtime. An answer of
`unknown_operation`/`internal` (an older core) shows "Activity is not available". Search on titles
(debounced), an "Add filter" popover of people (members, or "You" locally, plus agents by app
and the system seen in what was loaded: `activity/filters.ts`, `toQuery`) and event groups
(hosted windows also get Members, Sharing, Teamspaces, Integrations and tokens, Workspace
settings: `eventGroups(hosted)`; every type is in exactly one group, threads aside), chips
to remove them, headings Today / each of the last 7 days / weeks to 60 days / months
(`activity/groups.ts`), "Load more" on `nextCursor`. Each row is a sentence
(`activity/describe.ts`, one describer per type; a page that still exists is a link with its
current title, closing the settings; a change to the workspace itself has no target and names
its `data.subject`: "invited maya@example.com as a member", "changed Maya's role from member to
admin", "shared Roadmap with Maya (can edit)", "connected WordPress", "could not publish Roadmap
to Blog"). A session's page count leaves rows without a target out. Consecutive rows of one agent session fold into "Claude
Code made 14 changes in 6 pages" (`activity/sessions.ts`), expandable; Undo, for sessions the
signed-in person's agent ran (`history.listSessions`), asks "Undo 5 changes by Claude Code?",
counting what the undo acts on (the session's journal entries not undone yet,
`undoableSessions`; not the summary's activity count), runs `history.undoSession` and says how
many changes were undone and why any were skipped, then reloads), About. Command: "Export
workspace" (`settings.export`).

Theme commands: "Switch to light/dark theme", "Use system theme", and "Toggle dark mode"
(`settings.theme.toggle`, Mod+Shift+L as in Notion: the opposite of what shows, so it leaves
"system"). The default is light (`DEFAULTS.theme`, mirrored in `apps/web/public/theme.js`).

Preferences are per device (`app.storage`, keys in `preferences.ts`); `applyPreferences` applies
theme (`.dark`/`.system` on `<html>`, and `app.setColorScheme` for native menus), `--editor-font-size`, `--editor-block-max-width` and
`spellcheck` on `<html>`. "New documents" (`NewNoteSetting.tsx`, on Files & links) is the
folder's setting in folder windows (top level, next to the current note, or a folder path, saved
together with the path), which the host's New document command reads; other windows always put
new documents at the top level.

## Tests

`bun test` (navigation, search, deep links, shortcut recording and conflicts; the activity
page's wording, date groups, session folding and filters, and `pages/Activity.test.tsx` against a
fake backend: sessions and Undo, hosted reads, an older server, retry).
End-to-end: `apps/web/e2e/settings-team.e2e.ts`.
