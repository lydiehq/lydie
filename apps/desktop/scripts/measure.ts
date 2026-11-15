// S6 baseline: launches the packaged app (`bun run package:dir` first) several times and reports
// bundle size, time from spawn to first contentful paint, and idle memory per process type.
//   bun scripts/measure.ts [path/to/Lydie.app] [--runs=5] [--idle=5000]
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name: string, fallback: number) =>
  Number(args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
const runs = option("runs", 5);
const idleMs = option("idle", 5000);
const appPath = resolve(
  args.find((a) => !a.startsWith("--")) ??
    join(import.meta.dirname, "../dist", `mac-${process.arch}`, "Lydie.app"),
);
const binary =
  process.platform === "darwin" ? join(appPath, "Contents", "MacOS", "Lydie") : appPath;

type Measurement = {
  mainStartedAt: number;
  firstPaintAt: number;
  memoryKB: Record<string, number>;
  totalKB: number;
  processes: { pid: number; type: string }[];
};

// macOS physical footprint (what Activity Monitor shows), in MB per process type. Working-set
// numbers from Electron count shared framework pages once per process and overstate memory.
function footprint(processes: { pid: number; type: string }[]): Record<string, number> | null {
  if (process.platform !== "darwin") return null;
  const out: Record<string, number> = {};
  for (const { pid, type } of processes) {
    const result = spawnSync("footprint", ["-f", "bytes", "-p", String(pid)], { encoding: "utf8" });
    const match = /Footprint:\s+(\d+)\s+B/.exec(result.stdout);
    if (match?.[1]) out[type] = (out[type] ?? 0) + Number(match[1]) / 1024 / 1024;
  }
  return out;
}

async function measureOnce(): Promise<
  Measurement & { spawnedAt: number; physical: Record<string, number> | null }
> {
  const userData = await mkdtemp(join(tmpdir(), "lydie-measure-"));
  try {
    const spawnedAt = Date.now();
    const child = spawn(binary, [], {
      env: {
        ...process.env,
        LYDIE_MEASURE: "1",
        LYDIE_MEASURE_IDLE_MS: String(idleMs),
        LYDIE_USER_DATA: userData,
      },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    const line = await new Promise<string>((resolve, reject) => {
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        const found = output.split("\n").find((l) => l.startsWith("LYDIE_MEASURE "));
        if (found && output.includes("\n", output.indexOf(found))) resolve(found);
      });
      child.on("exit", () => reject(new Error(`App exited without a measurement:\n${output}`)));
    });
    const measurement = JSON.parse(line.slice("LYDIE_MEASURE ".length)) as Measurement;
    const physical = footprint(measurement.processes);
    child.kill("SIGTERM");
    await new Promise((done) => child.on("exit", done));
    return { spawnedAt, ...measurement, physical };
  } finally {
    await rm(userData, { recursive: true, force: true });
  }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
};

const size = spawnSync("du", ["-sk", appPath], { encoding: "utf8" }).stdout.split("\t")[0];
console.log(`App: ${appPath}`);
console.log(`Unpacked size: ${(Number(size) / 1024).toFixed(1)} MB`);

const results = [];
for (let i = 0; i < runs; i++) {
  const r = await measureOnce();
  const row = {
    run: i + 1,
    toMainMs: r.mainStartedAt - r.spawnedAt,
    toFirstPaintMs: Math.round(r.firstPaintAt - r.spawnedAt),
    workingSetMB: +(r.totalKB / 1024).toFixed(1),
    footprintMB: r.physical
      ? +Object.values(r.physical)
          .reduce((a, b) => a + b, 0)
          .toFixed(1)
      : null,
    ...Object.fromEntries(
      Object.entries(r.physical ?? {}).map(([type, mb]) => [type, +mb.toFixed(1)]),
    ),
  };
  results.push(row);
}
console.table(results);
console.log(
  `Median: first paint ${median(results.map((r) => r.toFirstPaintMs))} ms, ` +
    `idle working set ${median(results.map((r) => r.workingSetMB))} MB, ` +
    `idle footprint ${median(results.map((r) => r.footprintMB ?? Number.NaN))} MB (after ${idleMs} ms)`,
);
