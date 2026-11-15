// electron-updater behind the platform's `Updater` state machine. Disabled in development and
// whenever the build has no update feed (no app-update.yml next to the app).
//
// The feed (electron-builder.config.ts): a `github` app-update.yml is resolved to one release per
// check (update-feed.ts: a build stays on its channel, alpha on alpha); a `generic` one
// (LYDIE_UPDATE_URL at package time) is read as it is, with the channel electron-builder wrote
// from the version.
//
// Packaged builds check by themselves: shortly after launch and then every few hours. An update is
// downloaded in the background and installed when the app quits (`autoInstallOnAppQuit`); the UI
// can also check, download and restart through the platform's `Updater`.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { UpdateState } from "@lydie/platform";
import { app, net } from "electron";
import type { AppUpdater } from "electron-updater";

import { parseAppUpdateConfig, resolveGithubFeed } from "./update-feed.ts";
import type { AppUpdateConfig, ResolvedFeed } from "./update-feed.ts";

export type UpdaterController = {
  state(): UpdateState;
  check(): Promise<void>;
  download(): Promise<void>;
  restart(): void;
  // Background checks (and downloads) until the app quits. No-op when disabled.
  startAutomaticChecks(): void;
};

const FIRST_CHECK_MS = 30_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function createUpdater(onState: (state: UpdateState) => void): UpdaterController {
  let state: UpdateState = { status: "idle" };
  const set = (next: UpdateState) => {
    state = next;
    onState(next);
  };

  const configPath = join(process.resourcesPath, "app-update.yml");
  const disabledReason = !app.isPackaged
    ? "Updates are disabled in development"
    : process.env.LYDIE_DISABLE_UPDATER
      ? "Disabled by LYDIE_DISABLE_UPDATER"
      : !existsSync(configPath)
        ? "This build has no update feed"
        : null;
  if (disabledReason) {
    const disabled: UpdateState = { status: "disabled", reason: disabledReason };
    const noop = async () => {};
    return {
      state: () => disabled,
      check: noop,
      download: noop,
      restart: () => {},
      startAutomaticChecks: () => {},
    };
  }
  const config = parseAppUpdateConfig(readFileSync(configPath, "utf8"));

  let updater: AppUpdater | null = null;
  const load = async () => {
    if (updater) return updater;
    // CommonJS package; loaded lazily so it costs nothing at startup.
    const { autoUpdater } = (await import("electron-updater")).default;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("checking-for-update", () => set({ status: "checking" }));
    autoUpdater.on("update-available", (info) =>
      set({ status: "available", version: info.version }),
    );
    autoUpdater.on("update-not-available", () => set({ status: "not-available" }));
    autoUpdater.on("download-progress", (progress) =>
      set({
        status: "downloading",
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      }),
    );
    autoUpdater.on("update-downloaded", (info) =>
      set({ status: "downloaded", version: info.version }),
    );
    autoUpdater.on("error", (error) => set({ status: "error", message: error.message }));
    updater = autoUpdater;
    return autoUpdater;
  };

  // Points the updater at this check's release; false when the channel has no release yet.
  const pointAtRelease = async (updater: AppUpdater): Promise<boolean> => {
    if (config.provider !== "github") return true;
    set({ status: "checking" });
    let feed: ResolvedFeed | null;
    try {
      feed = await resolveGithubFeed(config, app.getVersion(), fetchText);
    } catch (error) {
      set({ status: "error", message: error instanceof Error ? error.message : String(error) });
      return false;
    }
    if (!feed) {
      set({ status: "not-available" });
      return false;
    }
    updater.setFeedURL({
      provider: "custom",
      updateProvider: await releaseProvider(),
      url: feed.url,
      channel: feed.channel,
    });
    return true;
  };

  const check = async () => {
    const updater = await load();
    if (await pointAtRelease(updater)) await updater.checkForUpdates();
  };
  const download = async () => {
    await (await load()).downloadUpdate();
  };

  // Failures are already in the state ("error"); a background check just tries again later.
  const automaticCheck = async () => {
    if (state.status === "checking" || state.status === "downloading") return;
    if (state.status === "downloaded") return;
    try {
      await check();
      if (state.status === "available") await download();
    } catch (error) {
      console.warn("[lydie] update check failed:", error);
    }
  };

  return {
    state: () => state,
    check,
    download,
    restart() {
      if (state.status === "downloaded") updater?.quitAndInstall();
    },
    startAutomaticChecks() {
      setTimeout(() => {
        void automaticCheck();
        setInterval(() => void automaticCheck(), CHECK_INTERVAL_MS).unref();
      }, FIRST_CHECK_MS).unref();
    },
  };
}

async function fetchText(url: string): Promise<string> {
  const response = await net.fetch(url, { headers: { accept: "application/atom+xml" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

type ProviderClass = new (options: AppUpdateConfig, updater: unknown, runtime: object) => unknown;
let releaseProviderClass: ProviderClass | null = null;

// A generic feed at one GitHub release. GitHub's asset storage answers a multi-range request
// with 501, so differential downloads ask for one range at a time, as electron-updater's GitHub
// provider does.
async function releaseProvider(): Promise<ProviderClass> {
  if (releaseProviderClass) return releaseProviderClass;
  const { GenericProvider } = (await import("electron-updater/out/providers/GenericProvider.js"))
    .default;
  class GithubReleaseProvider extends GenericProvider {
    constructor(
      options: AppUpdateConfig,
      updater: AppUpdater,
      runtime: ConstructorParameters<typeof GenericProvider>[2],
    ) {
      super(
        { provider: "generic", url: options.url ?? "", channel: options.channel ?? null },
        updater,
        { ...runtime, isUseMultipleRangeRequest: false },
      );
    }
  }
  releaseProviderClass = GithubReleaseProvider as unknown as ProviderClass;
  return releaseProviderClass;
}
