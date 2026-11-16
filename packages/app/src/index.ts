// `@lydie/app`: the plugin host. Backends and their transport are in `@lydie/app/backend`.
export { startApp } from "./start.ts";
export type { StartOptions } from "./start.ts";
export { createHost, DEFAULT_SHELL } from "./host/host.ts";
export type { Host, HostOptions, ShellState, Toast } from "./host/host.ts";
export { createDeviceStorage, createMemoryStorage } from "./host/stores.ts";
export type { DeviceStorage } from "./host/stores.ts";
export { browserHistory, syncUrl } from "./host/url-sync.ts";
export type { UrlHistory, UrlSyncOptions } from "./host/url-sync.ts";
export { appUrl, belowBase, parseAppUrl } from "./host/url.ts";
export { LydieApp } from "./shell/LydieApp.tsx";
export { useTitleBarInset, titleBarInset } from "./shell/title-bar.ts";
export type { TitleBarInset } from "./shell/title-bar.ts";
