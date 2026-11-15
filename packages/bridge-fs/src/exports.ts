// workspace.export where there is no one to ask where to save (the CLI, the local MCP server): the
// zip goes into `dir`, written as it is made, never over an existing file.
import { createWriteStream, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pathToFileURL } from "node:url";

import type { Exports } from "@lydie/runtime";

export function exportsTo(dir: string, workspaceName: string): Exports {
  return {
    workspaceName: () => workspaceName,
    async save({ filename, data }) {
      const dot = filename.lastIndexOf(".");
      let path = join(dir, filename);
      for (let i = 1; existsSync(path); i++) {
        path = join(dir, `${filename.slice(0, dot)} ${i}${filename.slice(dot)}`);
      }
      try {
        await pipeline(
          Readable.fromWeb(data as unknown as NodeReadableStream<Uint8Array>),
          createWriteStream(path, { flags: "wx" }),
        );
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
      return { url: pathToFileURL(path).href, expiresAt: null };
    },
  };
}
