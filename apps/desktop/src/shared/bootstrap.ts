import type {
  AppInfo,
  Capabilities,
  UpdateState,
  WindowRoute,
  WindowState,
  WorkspaceScope,
} from "@lydie/platform";

// Everything the preload needs synchronously, before the page runs. The main process passes it as
// a command-line switch of the renderer process (webPreferences.additionalArguments), which is
// readable from a sandboxed preload through process.argv.
export type WindowBootstrap = {
  windowId: string;
  scope: WorkspaceScope;
  capabilities: Capabilities;
  app: AppInfo;
  window: WindowState;
  update: UpdateState;
  deepLinkScheme: string | null;
  // `windows.open({ route })`: what the window shows first.
  route?: WindowRoute | null;
};

const SWITCH = "--lydie-bootstrap=";

export function encodeBootstrap(bootstrap: WindowBootstrap): string {
  return SWITCH + encodeURIComponent(JSON.stringify(bootstrap));
}

export function decodeBootstrap(argv: readonly string[]): WindowBootstrap {
  const arg = argv.find((value) => value.startsWith(SWITCH));
  if (!arg) throw new Error("Lydie: window bootstrap missing from renderer arguments");
  return JSON.parse(decodeURIComponent(arg.slice(SWITCH.length))) as WindowBootstrap;
}

// Scheme the production renderer is served from. Each host is its own origin.
export const APP_SCHEME = "lydie-app";
export const WEB_HOST = "web";
export const DIAGNOSTICS_HOST = "diagnostics";

// Scheme for deep links into the app (lydie://…).
export const DEEP_LINK_SCHEME = "lydie";
