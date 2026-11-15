// Which update feed a packaged build reads. Electron-free so it is unit-tested.
//
// Releases live on GitHub. electron-updater's own GitHub provider takes the newest entry of the
// releases feed whatever its channel, so an alpha build would move to a newer beta or stable
// release by surprise. Instead each check resolves one release here and reads it as a generic feed:
// - a stable build (2.0.0) reads latest-mac.yml from /releases/latest, which GitHub points at the
//   newest published non-prerelease;
// - a prerelease build (2.0.0-alpha.1, channel "alpha") reads the releases Atom feed, takes the
//   highest version with the same prerelease id and reads alpha-mac.yml from that release.
// Drafts are in neither, so a draft release reaches nobody until it is published.

export type AppUpdateConfig = Readonly<Record<string, string>>;

export type ResolvedFeed = {
  // Base URL of the release's assets; the channel file and the zips are relative to it.
  readonly url: string;
  // "alpha" reads alpha-mac.yml, "latest" reads latest-mac.yml.
  readonly channel: string;
};

type Version = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly (string | number)[];
};

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(text: string): Version | null {
  const match = VERSION.exec(text.trim());
  if (!match) return null;
  const prerelease = match[4]
    ? match[4].split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part))
    : [];
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease,
  };
}

// Semver precedence: a prerelease sorts before its release; identifiers compare numerically when
// both are numbers, numbers sort before strings, and a shorter list sorts first.
export function compareVersions(a: Version, b: Version): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return Math.sign(core);
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return Number(b.prerelease.length > 0) - Number(a.prerelease.length > 0);
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    const x = a.prerelease[i];
    const y = b.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return Math.sign(x - y);
    if (typeof x === "number") return -1;
    if (typeof y === "number") return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

// "latest" for a release, the first prerelease identifier otherwise ("alpha" for 2.0.0-alpha.1).
export function channelOf(version: Version): string {
  const first = version.prerelease[0];
  return first === undefined ? "latest" : String(first);
}

// app-update.yml as electron-builder writes it: flat `key: value` lines.
export function parseAppUpdateConfig(text: string): AppUpdateConfig {
  const config: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z][\w-]*):\s*(.*?)\s*$/.exec(line);
    if (!match?.[1] || match[2] === undefined) continue;
    config[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return config;
}

// Release tags in a GitHub releases Atom feed, from each entry's `/releases/tag/<tag>` link.
export function releaseTagsFromAtom(xml: string): string[] {
  const tags: string[] = [];
  for (const entry of xml.split(/<entry\b/).slice(1)) {
    const href = /<link\b[^>]*\bhref="[^"]*\/releases\/tag\/([^"/]+)"/.exec(entry)?.[1];
    if (href) tags.push(decodeURIComponent(href));
  }
  return tags;
}

// The highest tag on the same channel as `currentVersion`, or null when there is none.
export function pickReleaseTag(tags: readonly string[], currentVersion: string): string | null {
  const current = parseVersion(currentVersion);
  if (!current) return null;
  const channel = channelOf(current);
  let best: { tag: string; version: Version } | null = null;
  for (const tag of tags) {
    const version = parseVersion(tag);
    if (!version || channelOf(version) !== channel) continue;
    if (!best || compareVersions(version, best.version) > 0) best = { tag, version };
  }
  return best?.tag ?? null;
}

export type FetchText = (url: string) => Promise<string>;

// The feed for a `provider: github` app-update.yml, or null when the channel has no release yet.
export async function resolveGithubFeed(
  config: AppUpdateConfig,
  currentVersion: string,
  fetchText: FetchText,
): Promise<ResolvedFeed | null> {
  const { owner, repo } = config;
  if (!owner || !repo) throw new Error("app-update.yml names no GitHub repository");
  const current = parseVersion(currentVersion);
  if (!current) throw new Error(`Not a semver version: ${currentVersion}`);
  const host = config.host || "github.com";
  const base = `https://${host}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`;
  const channel = channelOf(current);
  if (channel === "latest") return { url: `${base}/latest/download`, channel };
  const tag = pickReleaseTag(releaseTagsFromAtom(await fetchText(`${base}.atom`)), currentVersion);
  return tag ? { url: `${base}/download/${encodeURIComponent(tag)}`, channel } : null;
}
