// Skipping literal-autolink constructs a document cannot contain must not change the parse.
import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { autolinkKinds, parseMdast } from "./syntax";

const ALL = { email: true, www: true, protocol: true, table: true };
const fixtures = join(import.meta.dir, "..", "fixtures");

function samples(): string[] {
  const out: string[] = [];
  for (const name of ["commonmark", "gfm"]) {
    const examples = JSON.parse(readFileSync(join(fixtures, "spec", `${name}.json`), "utf8")) as {
      markdown: string;
    }[];
    out.push(...examples.map((e) => e.markdown));
  }
  for (const f of readdirSync(join(fixtures, "ofm"))) {
    out.push(readFileSync(join(fixtures, "ofm", f), "utf8"));
  }
  out.push(
    "plain prose with no links at all, [label](x.md) and [[Wiki]] and `code`.",
    "WWW.example.com and Www.Example.com",
    "HTTPS://Example.com/x and http://a.b",
    "mail me: a.b+c@example.co.uk, or mailto:a@b.co, xmpp:a@b.co/x",
    "an at sign &commat; example.com, and user&#64;example.com and &#119;ww.example.com",
    "h&#116;tps://example.com and https&colon;&sol;&sol;example.com",
    "[link with www.inside.com](u) and ![img https://x.y](z)",
    "@mention and trailing @ and foo@bar",
    "www without a dot, http without colon, wwwexample.com",
    "a | b\n--|--\n1 | 2",
    "head\n---\n\nnot a table\n:--:\n",
    "&#124; a &#124; b &#124;\n&#124;---&#124;---&#124;",
    ...["---", "-", ":-", "-:", " :---: ", "---:", ":---", "- -", "--", ":", "-:-"].map(
      (d) => `a\n${d}\n`,
    ),
    "> quote\n> :--\n",
  );
  return out;
}

describe("literal autolink skipping", () => {
  it("detects what a document could contain", () => {
    expect(autolinkKinds("no links here")).toEqual({
      email: false,
      www: false,
      protocol: false,
      table: false,
    });
    expect(autolinkKinds("a | b")).toMatchObject({ table: true });
    expect(autolinkKinds("a@b")).toMatchObject({ email: true, www: false });
    expect(autolinkKinds("&commat;")).toMatchObject({ email: true });
    expect(autolinkKinds("WWW.x")).toMatchObject({ www: true });
    expect(autolinkKinds("HTTP")).toMatchObject({ protocol: true });
    expect(autolinkKinds("&#119;")).toMatchObject({ email: true, www: true, protocol: true });
  });

  it("gives the same tree as the full parser on every fixture and tricky input", () => {
    let narrowed = 0;
    for (const markdown of samples()) {
      const kinds = autolinkKinds(markdown);
      if (kinds.email && kinds.www && kinds.protocol && kinds.table) continue;
      narrowed++;
      expect(parseMdast(markdown)).toEqual(parseMdast(markdown, ALL));
    }
    expect(narrowed).toBeGreaterThan(500);
  });

  // The Obsidian help vault, when downloaded (`bun run fetch-corpus`).
  const vault = join(import.meta.dir, "..", ".cache", "obsidian-help", "en");
  it.skipIf(!existsSync(vault))("gives the same tree on the help vault", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith(".md")) out.push(p);
      }
      return out;
    };
    for (const path of walk(vault)) {
      const markdown = readFileSync(path, "utf8");
      expect(parseMdast(markdown)).toEqual(parseMdast(markdown, ALL));
    }
  });
});
