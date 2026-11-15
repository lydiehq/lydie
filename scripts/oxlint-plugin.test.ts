import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const clientRoot = resolve(import.meta.dir, "..");
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "lydie-lint-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let counter = 0;

// Lints one JSX snippet with the real config and returns how often the rule fired.
async function violations(jsx: string) {
  const file = join(dir, `case-${counter++}.tsx`);
  writeFileSync(file, `export const element = (\n${jsx}\n);\n`);
  const proc = Bun.spawn(
    ["bunx", "oxlint", "-c", join(clientRoot, ".oxlintrc.json"), "--format", "json", file],
    { cwd: clientRoot, stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  const { diagnostics } = JSON.parse(out) as { diagnostics: { code: string }[] };
  return diagnostics.filter((d) => d.code === "lydie(icon-button-tooltip)").length;
}

describe("lydie/icon-button-tooltip", () => {
  it("accepts buttons that say what they do", async () => {
    const ok = [
      `<Button>Save</Button>`,
      `<Button><AddRegular /> New page</Button>`,
      `<Button size="icon-sm" aria-label="New tab"><AddRegular /></Button>`,
      `<Button size="sm" tooltip="New tab"><AddRegular /></Button>`,
      `<Button size="icon-sm" tooltip={false}><AddRegular /></Button>`,
      `<Button size={size} aria-label="New tab"><AddRegular /></Button>`,
      `<Button {...props}><AddRegular /></Button>`,
      `<button type="button"><CloseRegular /> Close</button>`,
      `<button type="button">{children}</button>`,
      `<button type="button"><Title route={route} /></button>`,
      `<button type="button" aria-label="Open" className="absolute inset-0" />`,
      `<WithTooltip label="Close"><button type="button"><CloseRegular /></button></WithTooltip>`,
      `<TooltipTrigger><button type="button"><svg /></button><Tooltip>Close</Tooltip></TooltipTrigger>`,
    ];
    for (const jsx of ok) expect([jsx, await violations(jsx)]).toEqual([jsx, 0]);
  });

  it("flags buttons that show only an icon and have no tooltip", async () => {
    const bad = [
      `<Button size="icon-sm"><AddRegular /></Button>`,
      `<Button size="sm" aria-label="New tab"><AddRegular /></Button>`,
      `<Button><span className="flex"><AddRegular /></span></Button>`,
      `<button type="button" aria-label="Close"><CloseRegular className="size-3" /></button>`,
      `<button type="button" title="Close"><svg /></button>`,
      `<button type="button">{open ? <UpRegular /> : <DownRegular />}</button>`,
      `<button type="button">{action.icon}<span className="sr-only">Close</span></button>`,
      `<div role="button" tabIndex={0}><SidebarIcon /></div>`,
      `<LinkButton href="/x" size="icon-sm" aria-label="Home"><HomeRegular /></LinkButton>`,
    ];
    for (const jsx of bad) expect([jsx, await violations(jsx)]).toEqual([jsx, 1]);
  });
});
