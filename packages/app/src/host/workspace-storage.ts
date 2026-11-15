// Plugins keep some device settings per workspace, with the workspace id as one `:`-separated part
// of the key: favorites, Home's recent pages, expanded folders, the new-note location. A hand-off
// copies the workspace under a new id, so these are copied to that id too, and the document ids the
// hand-off changed (the Getting started page) are changed in them. What the target workspace
// already has on this device is kept.
import type { HostServices } from "@lydie/plugin-api";

import type { DeviceStorage } from "./stores.ts";
import { PLUGIN_STORAGE_PREFIX } from "./stores.ts";

export function carryWorkspaceStorage(
  storage: DeviceStorage,
  from: string,
  to: string,
  renamed: Readonly<Record<string, string>>,
): void {
  if (!storage.keys || from === to) return;
  const ids = new Map(Object.entries(renamed));
  const remap = (value: unknown): unknown => {
    if (typeof value === "string") return ids.get(value) ?? value;
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)]));
    }
    return value;
  };
  for (const key of storage.keys()) {
    if (!key.startsWith(PLUGIN_STORAGE_PREFIX)) continue;
    const parts = key.split(":");
    if (!parts.includes(from)) continue;
    const next = parts.map((part) => (part === from ? to : (ids.get(part) ?? part))).join(":");
    if (storage.get(next) !== null) continue;
    const value = storage.get<unknown>(key);
    if (value !== null) storage.set(next, remap(value));
  }
}

// The account's hand-off, copying the settings once a run succeeds (a run that failed is run again;
// copying twice changes nothing).
export function carryOnHandoff(
  services: HostServices | undefined,
  storage: DeviceStorage,
  workspaceId: string,
): HostServices | undefined {
  const account = services?.account;
  const handoff = account?.handoff;
  if (!services || !account || !handoff) return services;
  return {
    ...services,
    account: {
      ...account,
      handoff: {
        ...handoff,
        plan: (target) => handoff.plan(target),
        async run(plan, options) {
          const outcome = await handoff.run(plan, options);
          if (outcome.ok) {
            carryWorkspaceStorage(storage, workspaceId, plan.target.workspaceId, outcome.renamed);
          }
          return outcome;
        },
      },
    },
  };
}
