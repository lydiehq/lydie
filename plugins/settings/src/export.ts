import type { AppApi, DownloadProgress } from "@lydie/plugin-api";

// How far an export or a backup's download has got: a percentage when the end is known (a local
// export counts its entries; a backup has a size), else how much has arrived (a hosted export is
// a zip made as it is sent, so its size is not known until it ends).
export type SaveProgress = { percent: number } | { received: number };

export function downloadProgress({ received, total }: DownloadProgress): SaveProgress {
  return total ? { percent: Math.min(100, Math.floor((received / total) * 100)) } : { received };
}

// Runs workspace.export where the workspace lives (the hosted API for synced workspaces, the
// window's own runtime otherwise) and saves the zip, or reports where it was saved.
// `onProgress` hears how far it has got: a local export as it is written, a hosted one as its
// link is saved through `app.download` (the desktop app, and browsers that let a page write the
// file; elsewhere the browser's own download shows it).
export async function exportWorkspace(
  app: AppApi,
  options: { onProgress?: (progress: SaveProgress) => void } = {},
): Promise<void> {
  const onProgress = options.onProgress;
  const workspaceId = app.workspace.workspaceId;
  const account = app.services?.account;
  try {
    const result =
      app.workspace.mode === "synced" && account?.callContract
        ? await account.callContract("workspace.export", { workspaceId })
        : await app.backend.execute(
            "workspace.export",
            { workspaceId },
            onProgress
              ? {
                  onProgress: ({ done, total }) =>
                    onProgress({ percent: total ? Math.floor((done / total) * 100) : 0 }),
                }
              : undefined,
          );
    if (!result.url) return;
    if (result.url.startsWith("file:")) {
      app.notify({
        title: "Workspace exported",
        description: savedName(result.url, result.filename),
        kind: "success",
      });
      return;
    }
    if (result.url.startsWith("blob:")) {
      startDownload(result.url, result.filename);
      return;
    }
    await saveLink(
      app,
      { url: result.url, filename: result.filename },
      "Workspace exported",
      onProgress,
    );
  } catch (error) {
    app.notify({
      title: "Could not export the workspace",
      description: error instanceof Error ? error.message : String(error),
      kind: "error",
    });
  }
}

// The name the person gave the file in the save dialog, which may differ from the suggestion.
export function savedName(fileUrl: string, fallback: string): string {
  try {
    return decodeURIComponent(new URL(fileUrl).pathname.split("/").pop() ?? "") || fallback;
  } catch {
    return fallback;
  }
}

// A hosted export or backup link, saved where the person picks (desktop) or by the browser.
export async function saveLink(
  app: AppApi,
  link: { url: string; filename: string },
  title: string,
  onProgress?: (progress: SaveProgress) => void,
): Promise<void> {
  const saved = await app.download({
    ...link,
    ...(onProgress ? { onProgress: (p: DownloadProgress) => onProgress(downloadProgress(p)) } : {}),
  });
  if (saved.status === "saved") app.notify({ title, description: saved.name, kind: "success" });
}

// A zip the browser holds (a local export in a browser workspace).
export function startDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Blob URLs hold the whole zip in memory until revoked; the download has its own copy by then.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
