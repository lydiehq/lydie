# AGENTS.md - @lydie/plugin-account

Built-in plugin: account, workspaces and the local → hosted hand-off.

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

Only active when the composition offers `app.services.account`. Sign in / create account dialog
(`account.signIn`, email + password), the workspace menu section (`WorkspaceSection`: this
browser's workspace or, on desktop, the recent folders with their parent folder as a hint; the
account's cloud workspaces; "New cloud workspace…", "Open folder…" where `openFolder` exists,
"Copy to cloud…"; a switch that fails is a toast) and its last section (`AccountSection`,
after the settings plugin's row: waitlist, sign in, or "Sign out" as the last row; every action row
has an icon), the hand-off
dialog (`account.handoff`: choose a new or existing hosted workspace → dry-run summary → progress
→ "Open"; reopening switches the window's scope), the sidebar status item (in a local window "Join the cloud waitlist" while the server's
`waitlist.status` says accounts go through the waitlist, else "Sign in to Lydie Cloud"; in a hosted one the sync state with a details popover: pending changes, last synced,
retry time, Retry now, Sign in again, refused changes with dismiss), the Account settings page,
and `HostedBanner` (session ended / no longer a member: the workspace is missing from the
account's list, checked on open, focus, every minute and when a change is refused), which the web
app renders under the content. Offline has no banner: nothing is at risk, and the status item
says so (the shell shows it in the tab row while the sidebar is collapsed).

The Account page opens with the avatar (`AvatarCard.tsx`, `AvatarEditor` from the UI package):
the picture at 96 px, "Choose a doodle" (the ten scribbles and six pens, `scribbleImage`), "Draw
your own" (`ScribbleCanvas`, `drawnScribbleImage`); a new account starts with a random doodle. Saving calls
`api.setImage`, so it follows the account into every workspace. The workspace list shows each
synced workspace's picture (`image` from `workspaces()`; this window's live, `useWorkspaceImage`).

Two-step verification (LYD-384): the sign-in dialog asks for a code from the authenticator app (or
a backup code) when `signIn` rejects with "two_factor_required". The Account page's Security section
(`Security.tsx`) turns it on (`TwoFactorDialog`: password → QR code and setup key → code → backup
codes), off, or makes new backup codes; accounts without a password (Google only) see why it does
not apply. Its dialog is rendered by the page, not opened as an overlay, which would close
Settings. "Signed-in devices" lists `authSession.list` (this device first) with sign-out per
device and for all others.

"New cloud workspace…" creates the workspace with `gettingStarted: true` (the server adds the
Getting started page); the hand-off does not, since it brings its own pages.

Words (plan §8, "Lydie Cloud: words and pricing"): the service is "Lydie Cloud", a workspace in it a
"cloud workspace", the hand-off "Move to cloud…" for this browser's workspace and "Copy to cloud…"
for a folder (`toCloud(api)` in `sign-up.ts`: a move where `handoff.discard` exists). "Sync" is only the state of a cloud workspace
(Syncing, Synced, Offline). "Lydie Cloud is free for now. Fair use applies." is said in the new
workspace dialog and under Plan on the Account page.

Local notice (`local-notice.ts`, `LocalNotice` in `index.tsx`, rendered by `HostedBanner` in a local
window): so nobody writes in this browser's workspace believing it is their cloud one. The device
remembers the cloud workspace opened last and when (`account.cloud`, set when a hosted window opens) and
where each local workspace was copied to (`account.copied`, set when a hand-off succeeds). With
either, this browser's workspace (not a folder) shows a banner: signed out, "You are signed out of
Lydie Cloud… what you write here is not added to X" with Sign in; signed in, that this is the copy
in this browser, with "Open X" and "Copy to cloud…". Dismiss hides that kind (`localNotice`,
unit-tested). The hand-off dialog preselects the workspace copied to before, and its summary says
that pages already there stay as they are (a second copy brings new pages, not edits to old ones).

A move (LYD-422): when a run copied everything (ok, no conflicts, no missing files), "Open X" calls
`handoff.discard()` and then reopens, so this browser's workspace is gone and there is one place
for the notes. Anything short of that leaves it, with the local notice.

After signing in (`after-sign-in.ts`, `afterSignIn` unit-tested; also after a provider sign-in
comes back): a local window with nothing new (`handoff.hasNews(since)`, since a cloud workspace
was last open on this device) reopens on the cloud workspace used last, else one of the person's
own. With something new it stays, says "Signed in" and shows the local notice. The hand-off dialog
opens by itself only for an account with no cloud workspace yet, or when the caller asked for it
(`then: "handoff"`, the team pages) and there is something to bring. The sidebar entry no longer
asks for it.

Cloud waitlist: `account.waitlist` (`WaitlistDialog`: email → `waitlist.join` with source "app",
also a command and a workspace-menu row), `useSignUpMode()` / `localEntry()` in `sign-up.ts` (unknown
reads as "waitlist"). "Sign in" stays available everywhere; a sign-up refused because the email is
not approved offers the waitlist.

The window's scope never changes while it is open: switching workspaces, signing out of a hosted
window or finishing a hand-off reopens it (`account.openScope`, `openLocalWorkspace`). On desktop a
switch replaces the window: another window shows the workspace and this one closes.
