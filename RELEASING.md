# Releasing

The desktop app (macOS for now) is released from a tag by `.github/workflows/release.yml`. The web
app and the desktop app share one version (`apps/web/package.json`, `apps/desktop/package.json`).
The npm libraries have their own versions, managed with Changesets (`.changeset/README.md`); they
are not published yet.

## Cutting a release

1. Set the version in `apps/desktop/package.json` and `apps/web/package.json`, e.g.
   `2.0.0-alpha.2`, and commit.
2. Tag the commit and push the tag: `git tag v2.0.0-alpha.2 && git push origin v2.0.0-alpha.2`.
   The tag must be `v` + the version, or the workflow stops.
3. The workflow builds arm64 and x64, checks the files (`apps/desktop/scripts/check-release.ts`)
   and creates a **draft** release with the dmgs, zips, blockmaps and the channel file
   (`alpha-mac.yml`). A version with a prerelease part (`-alpha.2`) becomes a GitHub prerelease.
4. Review the draft (notes, files) and publish it. Users see nothing until then: drafts are not in
   the update feed.

A dry run: run the workflow by hand ("Run workflow" on the Actions tab, or
`gh workflow run release.yml --ref <branch>`). It builds and checks everything and attaches the
files to the run as an artifact, without creating a release.

## Signing and notarisation

Without secrets the app is ad-hoc signed, every file ends in `-unsigned` and the release says so.
macOS quarantines such a download ("Lydie is damaged and can't be opened";
`xattr -dr com.apple.quarantine /Applications/Lydie.app` gets past it) and the updater cannot
install it (see below). Set these repository secrets (Settings → Secrets and variables → Actions)
to sign and notarise:

| Secret             | Value                                                                                |
| ------------------ | ------------------------------------------------------------------------------------ |
| `CSC_LINK`         | The Developer ID Application certificate with its private key, as base64 of a `.p12` |
| `CSC_KEY_PASSWORD` | The `.p12` password                                                                  |
| `APPLE_API_KEY`    | Contents of the App Store Connect API key file (`AuthKey_XXXX.p8`)                   |
| `APPLE_API_KEY_ID` | The key's ID                                                                         |
| `APPLE_API_ISSUER` | The issuer ID (App Store Connect → Users and Access → Integrations)                  |

- Certificate: in the Apple Developer account, Certificates → "+" → Developer ID Application.
  Install it, export it with its key from Keychain Access as `.p12`, then
  `base64 -i cert.p12 | pbcopy`.
- API key: App Store Connect → Users and Access → Integrations → App Store Connect API → a team
  key with the Developer role.

With `CSC_LINK` set, all three `APPLE_API_*` secrets are required: the build fails rather than
ship a signed app that is not notarised. Signed builds use the hardened runtime with
`apps/desktop/build/entitlements.mac.plist` (JIT only; library validation stays on because every
native module is signed with the same certificate). The check step verifies the Developer ID
signature, the hardened runtime, Gatekeeper (`spctl`) and the stapled ticket.

## Update channels

The channel is the version's first prerelease identifier: `2.0.0-alpha.1` is on `alpha`, `2.0.0`
on `latest`.

- A build writes only its own channel file (`alpha-mac.yml` or `latest-mac.yml`).
- The packaged app's `app-update.yml` names the GitHub repository the release was built in. On each
  check the app picks the release (`apps/desktop/src/main/update-feed.ts`):
  - on a prerelease channel, the highest version on the same channel in the repository's
    releases feed (`/releases.atom`, the newest 10 published releases, prereleases included);
  - on `latest`, GitHub's latest release (`/releases/latest`, never a prerelease).

  So alpha users stay on alpha: a stable or beta release never reaches them, and stable users
  never get an alpha. Moving a user between channels means installing that build by hand.

- Draft releases are invisible to the updater; deleting a published release takes it out again.
- If more than 10 releases of other channels follow the last alpha, alpha users see no update.

## Testing an update locally

`LYDIE_UPDATE_URL` replaces the GitHub feed with a generic one (a folder with the channel file and
the zips).

```bash
cd apps/desktop
# The old version, pointed at a local feed.
bun run build
LYDIE_UPDATE_URL=http://127.0.0.1:8765/ bunx electron-builder --config electron-builder.config.ts \
  --mac zip --arm64 --publish never
mkdir -p /tmp/lydie-old && cp -R dist/mac-arm64/Lydie.app /tmp/lydie-old/Lydie.app
# The new version, built into the feed folder.
LYDIE_UPDATE_URL=http://127.0.0.1:8765/ bunx electron-builder --config electron-builder.config.ts \
  --mac zip --arm64 --publish never -c.extraMetadata.version=2.0.0-alpha.99 -c.directories.output=/tmp/lydie-feed
python3 -m http.server 8765 -d /tmp/lydie-feed
LYDIE_USER_DATA=/tmp/lydie-profile /tmp/lydie-old/Lydie.app/Contents/MacOS/Lydie
```

A packaged app checks 30 seconds after launch and every 4 hours, downloads an update in the
background and installs it when it quits (`src/main/updater.ts`); there is no update UI yet.
electron-updater logs to stdout, so start the app from a terminal to follow it.

Expect an ad-hoc signed app to find and download the update but fail to install it: Squirrel.Mac
installs only an update whose signature satisfies the running app's designated requirement, and
an ad-hoc signature's requirement is its exact code hash. This has not been observed yet; only
Developer ID builds are expected to update in place.
