// Fetches the fidelity corpora.
//
//   bun scripts/fetch-corpus.ts          # spec examples (committed) + Obsidian help vault (cache)
//   bun scripts/fetch-corpus.ts --specs  # only regenerate fixtures/spec/*.json
//   bun scripts/fetch-corpus.ts --vault  # only download the help vault into .cache/
//
// The CommonMark and GFM spec examples are CC BY-SA 4.0 and are committed as JSON under
// fixtures/spec/ (see fixtures/spec/README.md for attribution). The Obsidian help vault is
// downloaded into .cache/obsidian-help (gitignored) and never committed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const root = join(dirname(new URL(import.meta.url).pathname), "..");
const args = new Set(process.argv.slice(2));
const all = !args.has("--specs") && !args.has("--vault");

const COMMONMARK_VERSION = "0.31.2";
const COMMONMARK_URL = `https://spec.commonmark.org/${COMMONMARK_VERSION}/spec.json`;
const GFM_URL = "https://raw.githubusercontent.com/github/cmark-gfm/master/test/spec.txt";
const VAULT_REPO = "https://github.com/obsidianmd/obsidian-help.git";

type Example = { example: number; section: string; markdown: string };

async function fetchText(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return res.text();
}

// cmark-gfm's spec.txt format: examples are fenced by 32 backticks + " example", with "." separating
// input from output, and "→" standing for a tab.
function extractExamples(spec: string): Example[] {
  const out: Example[] = [];
  const fence = "`".repeat(32);
  const lines = spec.split("\n");
  let section = "";
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const heading = /^#{1,6} (.*)$/.exec(line);
    if (heading?.[1]) section = heading[1];
    if (!line.startsWith(`${fence} example`)) continue;
    const md: string[] = [];
    i++;
    while (i < lines.length && lines[i] !== ".") md.push(lines[i++] ?? "");
    while (i < lines.length && lines[i] !== fence) i++;
    out.push({
      example: ++n,
      section,
      markdown: md
        .map((l) => l + "\n")
        .join("")
        .replaceAll("→", "\t"),
    });
  }
  return out;
}

async function specs() {
  const dir = join(root, "fixtures", "spec");
  mkdirSync(dir, { recursive: true });
  const cm = (await (await fetch(COMMONMARK_URL)).json()) as Example[];
  writeFileSync(
    join(dir, "commonmark.json"),
    JSON.stringify(
      cm.map(({ example, section, markdown }) => ({ example, section, markdown })),
      null,
      1,
    ) + "\n",
  );
  const gfm = extractExamples(await fetchText(GFM_URL));
  writeFileSync(join(dir, "gfm.json"), JSON.stringify(gfm, null, 1) + "\n");
  console.log(`commonmark: ${cm.length} examples, gfm: ${gfm.length} examples -> ${dir}`);
}

async function vault() {
  const cache = join(root, ".cache");
  const target = join(cache, "obsidian-help");
  mkdirSync(cache, { recursive: true });
  // Downloaded data is untrusted: unpack into a fresh empty directory, never execute anything in it.
  // The repository is mostly images, so clone shallowly without blobs and check out only Markdown.
  const work = mkdtempSync(join(tmpdir(), "lydie-obsidian-help-"));
  const clone = join(work, "obsidian-help");
  const git = (...a: string[]) => {
    const r = spawnSync("git", a, { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")} failed`);
  };
  git("clone", "--depth=1", "--filter=blob:none", "--no-checkout", VAULT_REPO, clone);
  git("-C", clone, "sparse-checkout", "set", "--no-cone", "*.md");
  git("-C", clone, "checkout");
  rmSync(join(clone, ".git"), { recursive: true, force: true });
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  renameSync(clone, target);
  rmSync(work, { recursive: true, force: true });
  console.log(`obsidian-help -> ${target}`);
}

if (all || args.has("--specs")) await specs();
if (all || args.has("--vault")) await vault();
