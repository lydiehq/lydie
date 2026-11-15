# AGENTS.md - @lydie/plugin-publishing

Built-in plugin: publishing connections and the per-document publish panel.

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

Hosted windows only, and for now workspace owners and admins only (`admin.ts`, unit-tested: the
role from the synced `workspace.members` rows). For anyone else the settings page is left out of
the navigation, the "Publish this document" command is off, and the page (by deep link) and the
panel say publishing is for admins. Connected-folder marks still show for everyone.
Settings → Publishing (`/settings/connections`, the OAuth return address):
connected destinations (details: settings form, Test connection, Remove) and the connectors the
server offers, each with a Connect dialog built from its JSON Schemas (`schema-form.ts`,
unit-tested: credentials, settings), token, OAuth (redirect to the provider) or a generated
secret that is shown once. The right panel's "Publish" tab lists the document's publications:
create (destination + config form + subpages + auto-publish), Publish now, "Import existing"
(publications with subpages on connectors that can pull: `publication.run` with `import`, which
creates documents for what the destination already has), Unpublish, Remove,
auto-publish switch, item state with the external URL, the run log, and for diverged items why,
the lines changed on each side or the merge's conflict markers (`divergence.ts`, unit-tested), the
pull request link, and the resolutions (overwrite, keep remote, and pull only for connectors that
can pull). The panel follows the run an action queued until it finishes, and refreshes every 10 s
while the document has publications (the server marks edits, auto-publishes and finds remote edits
on its own schedule). The connect form has `noValidate`: the schema check decides.

End-to-end: `apps/web/e2e/hosted.e2e.ts` "publishing", against local fakes in
`apps/web/e2e/publishing-fakes.ts` (a signature-checking webhook receiver, a small WordPress REST
API).

Connected folders (`folder-marks.ts`, unit-tested): a publication the server reports as `folder`
(its root stands for the place itself, plan §7) marks its root document with
`setDocumentMarks("publishing", …)`, so `DocIcon` shows the destination's icon (GitHub's mark)
in the tree, tabs and pickers, and marks the folder's items with `setConnectedPages` (the
properties panel then adds keys to a page's own frontmatter). The marks come from
`publication.list` for the workspace: on
activation, on window focus, every minute, and when the publish panel reloads. On the root's own
publish card the state reads "Connected folder · N pages".
