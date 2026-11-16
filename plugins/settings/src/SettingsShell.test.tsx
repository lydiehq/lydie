// A settings page another plugin contributed: it sees its own plugin's app, and a crash stays in
// the page while the navigation keeps working.
import { afterEach, expect, spyOn, test } from "bun:test";

import { HostProvider, useApp } from "@lydie/plugin-api";
import type { AppApi, Contributed, HostBridge } from "@lydie/plugin-api";
import { cleanup, render, screen } from "@testing-library/react";

import { SettingsShell } from "./SettingsShell.tsx";

let quiet: { mockRestore(): void } | null = null;
afterEach(() => {
  cleanup();
  quiet?.mockRestore();
});

test("a crashing page shows its error in place; the navigation and other pages stay", async () => {
  quiet = spyOn(console, "error").mockImplementation(() => {});
  const apps = new Map<string, AppApi>();
  const appFor = (id: string) => {
    if (!apps.has(id)) apps.set(id, { overlays: { open() {}, close() {} } } as unknown as AppApi);
    return apps.get(id)!;
  };
  const seen: { app: AppApi | null } = { app: null };
  function Fine() {
    seen.app = useApp();
    return <p>Fine page</p>;
  }
  function Boom(): never {
    throw new Error("Out of order");
  }
  const pages: Contributed<"settings">[] = [
    { id: "boom", title: "Boom", component: Boom, pluginId: "alpha" },
    { id: "fine", title: "Fine", component: Fine, pluginId: "beta" },
  ];
  const host = {
    app: appFor("settings"),
    appFor,
    contributions: { list: () => pages, subscribe: () => () => {} },
    tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
  } as unknown as HostBridge;
  const view = (page: string) => (
    <HostProvider host={host}>
      <SettingsShell close={() => {}} props={{ page }} />
    </HostProvider>
  );

  const { rerender } = render(view("boom"));
  expect(await screen.findByText("Boom settings (alpha) failed")).toBeTruthy();
  const nav = screen.getByRole("button", { name: "Fine" });
  rerender(view("fine"));
  expect(await screen.findByText("Fine page")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Fine" })).toBe(nav);
  expect(seen.app).toBe(appFor("beta"));
});
