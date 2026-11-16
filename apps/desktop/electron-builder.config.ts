// Packaging for macOS (dmg + zip, arm64 and x64), Windows (nsis) and Linux (AppImage). Releases
// are cut for macOS only (.github/workflows/release.yml, RELEASING.md); the Windows and Linux
// targets have not been built yet.
//
// Signing (macOS), driven by the environment:
// - CSC_LINK (+ CSC_KEY_PASSWORD): a Developer ID Application certificate. The app is signed with
//   it, with the hardened runtime and build/entitlements.mac.plist, and notarised with an App
//   Store Connect API key: APPLE_API_KEY (path to the .p8 file), APPLE_API_KEY_ID, APPLE_API_ISSUER.
//   A certificate without the key fails the build: a signed but unnotarised app is still blocked
//   by Gatekeeper.
// - Neither: an ad-hoc signature ("-"), and every artifact name ends in "-unsigned". macOS
//   quarantines such a download ("Lydie is damaged"); fine for testing the pipeline.
//
// Updates: app-update.yml points at GitHub Releases of LYDIE_UPDATE_REPO ("owner/repo"; in GitHub
// Actions the repository the workflow runs in; default lydiehq/lydie). The updater resolves the
// release on the build's channel itself (src/main/update-feed.ts). LYDIE_UPDATE_URL overrides
// it with a generic feed (a folder holding the channel file and zips; e.g. a local test server).
// The channel follows the version: 2.0.0-alpha.1 writes alpha-mac.yml and reads only alpha
// releases, 2.0.0 writes latest-mac.yml. Each version writes only its own channel file
// (`generateUpdatesFilesForAllChannels: false`), so a stable release never lands in an alpha
// feed. LYDIE_UPDATE_REPO=none builds without a feed (the updater reports itself disabled).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Configuration } from "electron-builder";

import { unusedPackages } from "./scripts/runtime-dependencies.ts";
import { channelOf, parseVersion } from "./src/main/update-feed.ts";

const env = process.env;
const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "package.json"), "utf8")) as {
  version: string;
};
const parsedVersion = parseVersion(version);
if (!parsedVersion) throw new Error(`package.json version is not semver: ${version}`);
// electron-builder derives the channel from the version for generic feeds only; a github feed
// would get latest-mac.yml for an alpha. Set it for both.
const channel = channelOf(parsedVersion);
const updateUrl = env.LYDIE_UPDATE_URL;
const updateRepo = env.LYDIE_UPDATE_REPO || env.GITHUB_REPOSITORY || "lydiehq/lydie";
const hasCertificate = !!(env.CSC_LINK || env.CSC_NAME);
const hasNotaryKey = !!(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER);
if (hasCertificate && !hasNotaryKey) {
  throw new Error(
    "A signing certificate is set but APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER are " +
      "not: the build would be signed but not notarised.",
  );
}
const unsigned = hasCertificate ? "" : "-unsigned";
// The app icon, when it has been made (build/icon.icns); Electron's default otherwise.
const icon = join(import.meta.dirname, "build", "icon.icns");
const entitlements = join(import.meta.dirname, "build", "entitlements.mac.plist");

function publish(): Configuration["publish"] {
  if (updateUrl) return { provider: "generic", url: updateUrl, channel };
  if (updateRepo === "none") return null;
  const [owner, repo, ...rest] = updateRepo.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new Error(`LYDIE_UPDATE_REPO must be "owner/repo", got "${updateRepo}"`);
  }
  // Uploading is the release workflow's job (gh release upload); electron-builder runs with
  // --publish never and only writes app-update.yml and the channel file from this.
  return { provider: "github", owner, repo, channel };
}

const config: Configuration = {
  appId: "co.lydie.app",
  productName: "Lydie",
  copyright: "Copyright © Lydie",
  directories: { output: "dist", buildResources: "resources" },
  // The diagnostic page (out/renderer) is development-only and stays out of the package.
  files: [
    "package.json",
    "out/main/**",
    "out/preload/**",
    // The trackpad addon (scripts/build-native.ts; macOS, universal). Unpacked as a *.node.
    "native/build/trackpad.node",
    "!**/*.map",
    // Build inputs of better-sqlite3 (it ships prebuilds): sources and node-addon-api.
    "!node_modules/better-sqlite3/{deps,src,docs,node_modules}/**",
    // Packages bundled into out/main (electron-updater and its dependencies) or only needed to
    // build addons (scripts/runtime-dependencies.ts).
    ...unusedPackages(import.meta.dirname).map((name) => `!node_modules/${name}{,/**}`),
    // Sources and docs of the packages that stay: they run from lib/ and dist/.
    "!node_modules/{@powersync/*,@parcel/watcher,comlink}/src/**",
    "!node_modules/{*,@*/*}/docs/**",
  ],
  // The web app is the UI; it is served from here over lydie-app://web. Left out: what only the
  // browser loads. The browser's database (wa-sqlite builds and their OPFS file systems: the
  // desktop's databases are in the main process), the service worker (not registered in the
  // desktop app), and KaTeX's woff/ttf fallbacks (Chromium takes the woff2 listed first).
  extraResources: [
    {
      from: "../web/dist",
      to: "web",
      filter: [
        "**/*",
        "!**/*.map",
        "!assets/*wa-sqlite*",
        "!assets/OPFS*VFS*",
        "!sw.js",
        "!assets/KaTeX_*.{ttf,woff}",
      ],
    },
  ],
  asar: true,
  // Real files for native code: PowerSync's worker (started from app.asar.unpacked, see
  // `unpackedAsar` in @lydie/store/node) dlopens its SQLite extension next to itself and imports
  // the rest of this list. Native addons (*.node) are unpacked too.
  asarUnpack: [
    "node_modules/@powersync/**",
    "node_modules/comlink/**",
    "node_modules/better-sqlite3/**",
    "node_modules/@parcel/watcher*/**",
    "**/*.node",
  ],
  // @parcel/watcher ships N-API prebuilds that work in Electron without a rebuild.
  npmRebuild: false,
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  },
  protocols: [{ name: "Lydie", schemes: ["lydie"] }],
  // Only the native binaries of the platform and architecture being packaged (afterPack.ts).
  afterPack: "./scripts/after-pack.ts",
  generateUpdatesFilesForAllChannels: false,
  mac: {
    category: "public.app-category.productivity",
    ...(existsSync(icon) ? { icon } : {}),
    // Folders can be opened with Lydie from Finder ("Open With"); the app opens them as vaults.
    extendInfo: {
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: "Folder",
          CFBundleTypeRole: "Viewer",
          LSHandlerRank: "Alternate",
          LSItemContentTypes: ["public.folder"],
        },
      ],
    },
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
    // Without a certificate: ad-hoc ("-"). Flipping the fuses invalidates Electron's own
    // signature and Apple Silicon refuses to run unsigned code. The hardened runtime breaks
    // ad-hoc builds, so it comes with the certificate.
    identity: hasCertificate ? undefined : "-",
    hardenedRuntime: hasCertificate,
    entitlements: hasCertificate ? entitlements : undefined,
    entitlementsInherit: hasCertificate ? entitlements : undefined,
    notarize: hasCertificate,
    artifactName: `Lydie-\${version}-\${arch}-mac${unsigned}.\${ext}`,
  },
  dmg: { artifactName: `Lydie-\${version}-\${arch}${unsigned}.\${ext}` },
  win: {
    target: [{ target: "nsis", arch: ["x64", "arm64"] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    artifactName: "Lydie-Setup-${version}-${arch}.${ext}",
  },
  linux: {
    category: "Office",
    target: [{ target: "AppImage", arch: ["x64", "arm64"] }],
    artifactName: "Lydie-${version}-${arch}.${ext}",
  },
  publish: publish(),
};

export default config;
