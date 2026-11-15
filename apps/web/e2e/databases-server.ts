// `vite preview` of the databases suites' own build (`.e2e/databases`), so they do not share
// (or clobber) the other suites' build.
import { existsSync } from "node:fs";
import { join } from "node:path";

import { until } from "./helpers.ts";

const ROOT = join(import.meta.dir, "..");
const OUT = ".e2e/databases";

export type Server = { url: string; stop(): Promise<void> };

export async function startDatabasesServer(fixedPort?: number): Promise<Server> {
  if (!existsSync(join(ROOT, OUT))) throw new Error(`Missing ${OUT}: run test:e2e:databases`);
  let port = fixedPort;
  if (!port) {
    const probe = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    port = probe.port;
    probe.stop(true);
  }
  const proc = Bun.spawn(
    [
      "bunx",
      "vite",
      "preview",
      "--configLoader",
      "runner",
      "--outDir",
      OUT,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const url = `http://127.0.0.1:${port}/`;
  try {
    await until(
      async () => {
        try {
          return (await fetch(url)).ok;
        } catch {
          return false;
        }
      },
      20_000,
      "vite preview",
    );
  } catch (error) {
    proc.kill();
    throw error;
  }
  return {
    url,
    async stop() {
      proc.kill();
      await proc.exited;
    },
  };
}
