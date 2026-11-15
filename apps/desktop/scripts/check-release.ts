// Checks a packaged macOS release in dist/ and copies what gets uploaded into dist/release/:
// - exactly one channel file, the version's own (alpha-mac.yml for 2.0.0-alpha.1, latest-mac.yml
//   for 2.0.0), carrying this version and a zip per architecture with the right size and sha512;
// - a dmg and a zip per architecture, each with its blockmap, named "-unsigned" unless --signed;
// - app-update.yml in each app: the GitHub repository (or generic URL) and the channel;
// - the code signature: valid for every build; with --signed also Developer ID, Gatekeeper and a
//   stapled notarisation ticket.
//
// bun scripts/check-release.ts [--arch arm64,x64] [--signed]
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { channelOf, parseAppUpdateConfig, parseVersion } from "../src/main/update-feed.ts";

const { values } = parseArgs({
  options: { arch: { type: "string", default: "arm64,x64" }, signed: { type: "boolean" } },
});
const arches = (values.arch ?? "").split(",").filter(Boolean);
const signed = values.signed ?? false;

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string;
};
const parsed = parseVersion(version);
if (!parsed) throw new Error(`package.json version is not semver: ${version}`);
const channel = channelOf(parsed);
const suffix = signed ? "" : "-unsigned";

const problems: string[] = [];
const check = (ok: boolean, problem: string) => {
  if (!ok) problems.push(problem);
};
const upload: string[] = [];

const channelFile = `${channel}-mac.yml`;
const channelFiles = readdirSync(dist).filter((name) => /-mac\.yml$/.test(name));
check(
  channelFiles.length === 1 && channelFiles[0] === channelFile,
  `expected only ${channelFile} in dist/, found: ${channelFiles.join(", ") || "none"}`,
);

type FeedFile = { url: string; sha512: string; size: number };
const feed = existsSync(join(dist, channelFile))
  ? (Bun.YAML.parse(readFileSync(join(dist, channelFile), "utf8")) as {
      version?: string;
      files?: FeedFile[];
    })
  : null;
if (feed) {
  upload.push(channelFile);
  check(feed.version === version, `${channelFile} has version ${feed.version}, not ${version}`);
}

for (const arch of arches) {
  const zip = `Lydie-${version}-${arch}-mac${suffix}.zip`;
  const dmg = `Lydie-${version}-${arch}${suffix}.dmg`;
  for (const name of [zip, `${zip}.blockmap`, dmg, `${dmg}.blockmap`]) {
    const present = existsSync(join(dist, name));
    check(present, `missing dist/${name}`);
    if (present) upload.push(name);
  }
  const listed = feed?.files?.find((file) => file.url === zip);
  check(!!listed, `${channelFile} does not list ${zip}`);
  if (listed && existsSync(join(dist, zip))) {
    const bytes = readFileSync(join(dist, zip));
    check(listed.size === bytes.length, `${zip}: size in ${channelFile} does not match`);
    const sha512 = createHash("sha512").update(bytes).digest("base64");
    check(listed.sha512 === sha512, `${zip}: sha512 in ${channelFile} does not match`);
  }

  const app = join(dist, arch === "x64" ? "mac" : `mac-${arch}`, "Lydie.app");
  if (!existsSync(app)) {
    problems.push(`missing ${app}`);
    continue;
  }
  const updateYml = join(app, "Contents", "Resources", "app-update.yml");
  if (existsSync(updateYml)) {
    const config = parseAppUpdateConfig(readFileSync(updateYml, "utf8"));
    const target =
      config.provider === "github" ? `github ${config.owner}/${config.repo}` : config.url;
    const expected = process.env.LYDIE_UPDATE_URL
      ? process.env.LYDIE_UPDATE_URL
      : `github ${process.env.LYDIE_UPDATE_REPO || process.env.GITHUB_REPOSITORY || "lydiehq/lydie"}`;
    check(target === expected, `${arch}: app-update.yml points at ${target}, not ${expected}`);
    check(
      config.channel === channel,
      `${arch}: app-update.yml has channel ${config.channel}, not ${channel}`,
    );
  } else {
    problems.push(`${arch}: no app-update.yml, the updater would be disabled`);
  }

  const run = (command: string, ...args: string[]) => {
    const result = spawnSync(command, args, { encoding: "utf8" });
    return { ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() };
  };
  const verify = run("codesign", "--verify", "--deep", "--strict", app);
  check(verify.ok, `${arch}: codesign --verify failed: ${verify.output}`);
  const details = run("codesign", "-dvv", app).output;
  const developerId = /Authority=Developer ID Application/.test(details);
  if (signed) {
    check(developerId, `${arch}: not signed with a Developer ID certificate`);
    check(/flags=.*runtime/.test(details), `${arch}: hardened runtime is off`);
    const gatekeeper = run("spctl", "--assess", "--type", "execute", "-vv", app);
    check(gatekeeper.ok, `${arch}: Gatekeeper rejects the app: ${gatekeeper.output}`);
    const stapled = run("xcrun", "stapler", "validate", app);
    check(stapled.ok, `${arch}: no notarisation ticket stapled: ${stapled.output}`);
  } else {
    check(/Signature=adhoc/.test(details), `${arch}: expected an ad-hoc signature`);
  }
}

if (problems.length > 0) {
  console.error(`Release check failed for ${version} (${channel}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

const out = join(dist, "release");
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const name of upload) copyFileSync(join(dist, name), join(out, name));
console.log(
  `Lydie ${version}, channel ${channel}, ${signed ? "signed and notarised" : "unsigned"}:`,
);
for (const name of upload) console.log(`  dist/release/${name}`);
