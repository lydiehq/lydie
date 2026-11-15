import { describe, expect, test } from "bun:test";

import {
  channelOf,
  compareVersions,
  parseAppUpdateConfig,
  parseVersion,
  pickReleaseTag,
  releaseTagsFromAtom,
  resolveGithubFeed,
} from "./update-feed.ts";

function atom(...tags: string[]): string {
  const entries = tags.map(
    (tag) => `  <entry>
    <id>tag:github.com,2008:Repository/1/${tag}</id>
    <updated>2026-11-15T10:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/lydiehq/lydie/releases/tag/${tag}"/>
    <title>Lydie ${tag}</title>
    <content type="html">No content.</content>
  </entry>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">
  <id>tag:github.com,2008:https://github.com/lydiehq/lydie/releases</id>
  <link type="text/html" rel="alternate" href="https://github.com/lydiehq/lydie/releases"/>
  <link type="application/atom+xml" rel="self" href="https://github.com/lydiehq/lydie/releases.atom"/>
  <title>Release notes from lydie</title>
${entries.join("\n")}
</feed>`;
}

const config = parseAppUpdateConfig(
  "owner: lydiehq\nrepo: lydie\nprovider: github\nupdaterCacheDirName: lydie-updater\n",
);

function version(text: string) {
  const parsed = parseVersion(text);
  if (!parsed) throw new Error(text);
  return parsed;
}

describe("versions", () => {
  test("semver precedence", () => {
    const ordered = [
      "1.9.9",
      "2.0.0-alpha.1",
      "2.0.0-alpha.2",
      "2.0.0-alpha.10",
      "2.0.0-alpha.beta",
      "2.0.0-beta.1",
      "2.0.0",
      "2.0.1-alpha.1",
      "v2.1.0",
    ];
    for (let i = 1; i < ordered.length; i++) {
      const a = version(ordered[i - 1] ?? "");
      const b = version(ordered[i] ?? "");
      expect(compareVersions(a, b)).toBe(-1);
      expect(compareVersions(b, a)).toBe(1);
    }
    expect(compareVersions(version("2.0.0-alpha.1"), version("v2.0.0-alpha.1"))).toBe(0);
  });

  test("channel is the first prerelease identifier", () => {
    expect(channelOf(version("2.0.0-alpha.1"))).toBe("alpha");
    expect(channelOf(version("2.0.0-beta.3"))).toBe("beta");
    expect(channelOf(version("2.0.0"))).toBe("latest");
    expect(parseVersion("lydie-2")).toBeNull();
  });
});

describe("parseAppUpdateConfig", () => {
  test("reads electron-builder's flat yaml", () => {
    expect(
      parseAppUpdateConfig("provider: generic\nurl: 'http://localhost:8080/'\nchannel: alpha"),
    ).toEqual({ provider: "generic", url: "http://localhost:8080/", channel: "alpha" });
  });
});

describe("pickReleaseTag", () => {
  const tags = releaseTagsFromAtom(
    atom(
      "v2.0.0",
      "v2.1.0-beta.1",
      "v2.0.0-alpha.10",
      "v2.0.0-alpha.9",
      "nightly",
      "v2.0.0-alpha.2",
    ),
  );

  test("reads every entry's tag", () => {
    expect(tags).toEqual([
      "v2.0.0",
      "v2.1.0-beta.1",
      "v2.0.0-alpha.10",
      "v2.0.0-alpha.9",
      "nightly",
      "v2.0.0-alpha.2",
    ]);
  });

  test("an alpha build stays on alpha, even when a newer stable or beta is first in the feed", () => {
    expect(pickReleaseTag(tags, "2.0.0-alpha.1")).toBe("v2.0.0-alpha.10");
  });

  test("a beta build only sees betas", () => {
    expect(pickReleaseTag(tags, "2.0.0-beta.1")).toBe("v2.1.0-beta.1");
  });

  test("no release on the channel", () => {
    expect(pickReleaseTag(tags, "2.0.0-rc.1")).toBeNull();
  });
});

describe("resolveGithubFeed", () => {
  test("a prerelease reads its channel file from the newest release on its channel", async () => {
    const requested: string[] = [];
    const feed = await resolveGithubFeed(config, "2.0.0-alpha.1", async (url) => {
      requested.push(url);
      return atom("v2.0.0", "v2.0.0-alpha.3", "v2.0.0-alpha.2");
    });
    expect(requested).toEqual(["https://github.com/lydiehq/lydie/releases.atom"]);
    expect(feed).toEqual({
      url: "https://github.com/lydiehq/lydie/releases/download/v2.0.0-alpha.3",
      channel: "alpha",
    });
  });

  test("a release reads latest-mac.yml of GitHub's latest release, without the feed", async () => {
    const feed = await resolveGithubFeed(config, "2.0.0", async () => {
      throw new Error("not fetched");
    });
    expect(feed).toEqual({
      url: "https://github.com/lydiehq/lydie/releases/latest/download",
      channel: "latest",
    });
  });

  test("null when the channel has no published release", async () => {
    expect(await resolveGithubFeed(config, "2.0.0-alpha.1", async () => atom())).toBeNull();
  });

  test("needs a repository", async () => {
    expect(
      resolveGithubFeed({ provider: "github" }, "2.0.0-alpha.1", async () => atom()),
    ).rejects.toThrow("no GitHub repository");
  });
});
