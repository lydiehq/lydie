import type { DownloadOptions, DownloadResult, Platform } from "@lydie/platform";

// `app.download`: the shell's own downloads where it has them, else a plain link, which the
// browser downloads and shows in its own downloads.
export function download(platform: Platform, options: DownloadOptions): Promise<DownloadResult> {
  if (platform.downloads) return platform.downloads.save(options);
  const link = document.createElement("a");
  link.href = options.url;
  link.download = options.filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  return Promise.resolve({ status: "started" });
}
