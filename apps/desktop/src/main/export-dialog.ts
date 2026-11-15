// workspace.export in folder windows: the zip goes where the person picks, written as it is made.
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pathToFileURL } from "node:url";

import type { Exports } from "@lydie/runtime";
import { app, BrowserWindow, dialog } from "electron";

export function saveExportDialog(name: string): Exports {
  return {
    workspaceName: () => name,
    async save({ filename, data }) {
      const parent = BrowserWindow.getFocusedWindow();
      const options = {
        defaultPath: join(app.getPath("downloads"), filename),
        filters: [{ name: "Zip archive", extensions: ["zip"] }],
      };
      const picked = parent
        ? await dialog.showSaveDialog(parent, options)
        : await dialog.showSaveDialog(options);
      if (picked.canceled || !picked.filePath) {
        await data.cancel();
        return { url: null, expiresAt: null };
      }
      const path = picked.filePath;
      try {
        await pipeline(
          Readable.fromWeb(data as unknown as NodeReadableStream<Uint8Array>),
          createWriteStream(path),
        );
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
      return { url: pathToFileURL(path).href, expiresAt: null };
    },
  };
}
