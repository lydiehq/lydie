// The environment of a test launch: this process's minus anything that would point the app at a
// dev server, with `overrides` on top. The app runs in the background (no Dock icon, windows never
// take focus) unless LYDIE_E2E_FOREGROUND is set, e.g. to watch a run.
const skip = new Set(["ELECTRON_RENDERER_URL", "LYDIE_WEB_URL", "ELECTRON_RUN_AS_NODE"]);

export function launchEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = { ...overrides };
  if (!process.env.LYDIE_E2E_FOREGROUND) env.LYDIE_BACKGROUND ??= "1";
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !skip.has(key)) env[key] ??= value;
  }
  return env;
}
