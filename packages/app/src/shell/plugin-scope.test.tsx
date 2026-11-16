// Each plugin's own app (storage, permissions), contributions that act as the plugin that made
// them, and plugins that fail: rolled back, reported, and contained where they render.
import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { createTestPlatform } from "@lydie/platform/testing";
import {
  ContributionBoundary,
  definePlugin,
  docPath,
  DocumentSlots,
  useApp,
} from "@lydie/plugin-api";
import type { AppApi, HostServices, PluginContext, PluginDef, ViewProps } from "@lydie/plugin-api";
import { createRuntime } from "@lydie/runtime";
import { openNodeStore } from "@lydie/store/node";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect } from "react";

import { createEventHub, createLocalBackend } from "../backend/local.ts";
import { handledOperations } from "../backend/registry.ts";
import { createMemoryStorage } from "../host/stores.ts";
import { startApp } from "../start.ts";
import { LydieApp } from "./LydieApp.tsx";

const WS = "01973200-0000-0000-0000-000000000000";
const closers: (() => Promise<void>)[] = [];
let quiet: { mockRestore(): void } | null = null;

afterEach(async () => {
  cleanup();
  quiet?.mockRestore();
  quiet = null;
  for (const fn of closers.splice(0).reverse()) await fn();
});

// Failures are logged on purpose here.
const hush = () => {
  quiet = spyOn(console, "error").mockImplementation(() => {});
};

async function setup(
  plugins: readonly PluginDef[],
  options: { storage?: ReturnType<typeof createMemoryStorage>; services?: HostServices } = {},
) {
  const tmp = (process.env.TMPDIR ?? "/tmp").replace(/\/$/, "");
  const store = await openNodeStore({ path: `${tmp}/lydie-scope-${crypto.randomUUID()}.sqlite` });
  const hub = createEventHub();
  const runtime = createRuntime({
    ...store.ports,
    registry: handledOperations(),
    events: hub.port,
    actor: { type: "user", id: "u1" },
  });
  const backend = createLocalBackend({
    store,
    runtime,
    events: hub,
    info: { workspaceId: WS, workspaceName: "Test", persistent: true },
  });
  const storage = options.storage ?? createMemoryStorage();
  const host = await startApp({
    backend,
    platform: createTestPlatform(),
    plugins,
    storage,
    layoutDebounceMs: 0,
    ...(options.services ? { services: options.services } : {}),
  });
  closers.push(async () => {
    host.dispose();
    await host.layout.flush();
    await backend.close();
    await store.close();
  });
  return { host, backend, storage };
}

// A plugin that keeps its context for the test to look at.
function capturing(id: string, extra: Partial<PluginDef> = {}) {
  const seen: { ctx: PluginContext | null } = { ctx: null };
  const plugin = definePlugin({
    id,
    name: id,
    ...extra,
    activate(ctx) {
      seen.ctx = ctx;
      return extra.activate?.(ctx);
    },
  });
  return { plugin, seen };
}

describe("a plugin's own app", () => {
  test("storage is the plugin's: another plugin cannot read or overwrite it; the shared area is everyone's", async () => {
    const a = capturing("alpha");
    const b = capturing("beta");
    const { host, storage } = await setup([a.plugin, b.plugin]);
    const appA = a.seen.ctx!.app;
    const appB = b.seen.ctx!.app;
    expect(appA).not.toBe(appB);
    expect(appA).not.toBe(host.app);

    const heard: string[] = [];
    appA.storage.subscribe!("mode", () => heard.push("alpha"));
    appB.storage.subscribe!("mode", () => heard.push("beta"));
    appA.storage.set("mode", "dark");
    expect(appA.storage.get("mode")).toBe("dark");
    expect(appB.storage.get("mode")).toBeNull();
    appB.storage.set("mode", "light");
    expect(appA.storage.get("mode")).toBe("dark");
    expect(heard).toEqual(["alpha", "beta"]);
    expect(storage.get("plugin:alpha:mode")).toBe("dark");
    expect(storage.get("plugin:beta:mode")).toBe("light");

    appA.storage.shared!.set("inbox", "Notes");
    expect(appB.storage.shared!.get("inbox")).toBe("Notes");
    expect(storage.get("plugin:shared:inbox")).toBe("Notes");
    // The shell's own keys are its plugin's ("core").
    host.app.storage.set("shell.peekHintSeen", true);
    expect(storage.get("plugin:core:shell.peekHintSeen")).toBe(true);
  });

  test("keys stored under their old names move to the plugin's area on start", async () => {
    const storage = createMemoryStorage();
    storage.set("plugin:threads.shown", false);
    storage.set("plugin:editor.fontSize", 17);
    // Already at its new name: kept, and the old copy dropped.
    storage.set("plugin:databases.peekWidth", 300);
    storage.set("plugin:databases:peekWidth", 420);
    // Keys that were already under the plugin's id stay where they are.
    storage.set(`plugin:document-tree:favorites:${WS}`, ["a"]);
    storage.set("keymap", { x: [] });
    const threads = capturing("threads");
    const settings = capturing("settings");
    const databases = capturing("databases");
    const tree = capturing("document-tree");
    await setup([threads.plugin, settings.plugin, databases.plugin, tree.plugin], { storage });
    expect(threads.seen.ctx!.app.storage.get("shown")).toBe(false);
    expect(settings.seen.ctx!.app.storage.get("editor.fontSize")).toBe(17);
    expect(databases.seen.ctx!.app.storage.get("peekWidth")).toBe(420);
    expect(tree.seen.ctx!.app.storage.get(`favorites:${WS}`)).toEqual(["a"]);
    expect(storage.get("plugin:threads.shown")).toBeNull();
    expect(storage.get("plugin:databases.peekWidth")).toBeNull();
    expect(storage.get("keymap")).toEqual({ x: [] });
  });

  test("privileged services and device members only with the declared permission", async () => {
    const account = { scope: { kind: "local", workspaceId: null } } as unknown as NonNullable<
      HostServices["account"]
    >;
    const collab = { open() {} } as unknown as NonNullable<HostServices["collab"]>;
    const services: HostServices = {
      account,
      collab,
      vault: { folder: "/notes", mcp: null, settings: null },
      renameWorkspace: async () => {},
    };
    const plain = capturing("plain");
    const signedIn = capturing("signed-in", { permissions: ["account"] });
    const admin = capturing("admin", { permissions: ["plugins"] });
    const { host } = await setup([plain.plugin, signedIn.plugin, admin.plugin], { services });
    const plainApp = plain.seen.ctx!.app;
    expect(plainApp.services?.account).toBeUndefined();
    expect(plainApp.services?.renameWorkspace).toBeUndefined();
    expect(plainApp.services?.vault).toBeUndefined();
    expect(plainApp.services?.collab).toBe(collab);
    expect(() => plainApp.plugins!.setEnabled("signed-in", false)).toThrow(/permission/);
    expect(plainApp.plugins!.list().length).toBe(3);

    const signedInApp = signedIn.seen.ctx!.app;
    expect(signedInApp.services?.account).toBeDefined();
    expect(signedInApp.services?.renameWorkspace).toBeDefined();
    expect(signedInApp.services?.vault).toBeUndefined();

    admin.seen.ctx!.app.plugins!.setEnabled("plain", false);
    expect(host.app.plugins!.list().find((p) => p.id === "plain")?.enabled).toBe(false);
    expect(host.app.plugins!.list().find((p) => p.id === "signed-in")?.permissions).toEqual([
      "account",
    ]);
    // The shell has everything.
    expect(host.app.services?.vault?.folder).toBe("/notes");
    expect(host.app.services?.account).toBeDefined();
  });

  test("callbacks get the app of the plugin that contributed them, whoever calls them", async () => {
    const got: Record<string, AppApi> = {};
    const owner = capturing("owner", {
      activate(ctx) {
        ctx.commands.register({
          id: "owner.run",
          title: "Run",
          when: (app) => ((got.when = app), true),
          paletteTitle: (app) => ((got.paletteTitle = app), "Run now"),
          run: ({ app }) => void (got.run = app),
        });
        ctx.documentMenu.register({
          id: "stamp",
          label: "Stamp",
          run: (_doc, app) => void (got.menu = app),
        });
        ctx.views.register({
          path: "/owner",
          component: () => null,
          preload: (_path, app) => void (got.preload = app),
        });
      },
    });
    const { host } = await setup([owner.plugin]);
    const mine = owner.seen.ctx!.app;
    host.app.commands();
    await host.app.runCommand("owner.run");
    const [item] = host.contributions.list("documentMenu");
    await item!.run({ id: "x", title: "X", parentId: null }, host.app);
    host.app.open("/owner");
    expect(got.when).toBe(mine);
    expect(got.paletteTitle).toBe(mine);
    expect(got.run).toBe(mine);
    expect(got.menu).toBe(mine);
    expect(got.preload).toBe(mine);
  });

  test("a document menu item that throws is a toast, not an unhandled rejection", async () => {
    const owner = capturing("owner", {
      activate(ctx) {
        ctx.documentMenu.register({
          id: "boom",
          label: "Explode",
          run: async () => {
            throw new Error("No luck");
          },
        });
      },
    });
    const { host } = await setup([owner.plugin]);
    const [item] = host.contributions.list("documentMenu");
    await item!.run({ id: "x", title: "X", parentId: null }, host.app);
    expect(host.toasts.get().at(-1)).toMatchObject({
      title: "Explode failed",
      description: "No luck",
      kind: "error",
    });
  });

  test("useApp() in a contribution is its plugin's app; in the shell, the shell's", async () => {
    const seen: { section?: AppApi; slot?: AppApi } = {};
    function Section() {
      seen.section = useApp();
      return <p>Section</p>;
    }
    const owner = capturing("owner", {
      activate(ctx) {
        ctx.sidebar.register({ id: "owner.section", component: Section });
      },
    });
    const { host } = await setup([owner.plugin]);
    render(<LydieApp host={host} />);
    await screen.findByText("Section");
    expect(seen.section).toBe(owner.seen.ctx!.app);
    expect(host.bridge.appFor!("owner")).toBe(owner.seen.ctx!.app);
    expect(host.bridge.app).toBe(host.app);
  });
});

describe("plugins that fail", () => {
  test("a throwing activate removes what it registered and shows in the plugin list", async () => {
    hush();
    const broken = definePlugin({
      id: "broken",
      name: "Broken",
      activate(ctx) {
        ctx.commands.register({ id: "broken.go", title: "Go", run() {} });
        ctx.sidebar.register({ id: "broken.section", component: () => null });
        throw new Error("Half way");
      },
    });
    const { host } = await setup([broken]);
    expect(host.contributions.list("command").some((c) => c.id === "broken.go")).toBe(false);
    expect(host.contributions.list("sidebar")).toHaveLength(0);
    expect(host.pluginErrors.get()).toEqual([{ pluginId: "broken", error: new Error("Half way") }]);
    expect(host.app.plugins!.list().find((p) => p.id === "broken")?.error).toBe("Half way");
  });

  test("a plugin that fails after activate (a late load) is rolled back and reported", async () => {
    hush();
    let fail: ((error: unknown) => void) | null = null;
    let cleanedUp = 0;
    const late = definePlugin({
      id: "late",
      name: "Late",
      essential: true,
      activate(ctx) {
        fail = (error) => ctx.fail(error);
        ctx.commands.register({ id: "late.go", title: "Go", run() {} });
        return () => void cleanedUp++;
      },
    });
    const { host } = await setup([late]);
    let notified = 0;
    host.app.plugins!.subscribe!(() => notified++);
    expect(host.contributions.list("command").some((c) => c.id === "late.go")).toBe(true);
    fail!(new Error("Chunk failed to load"));
    expect(host.contributions.list("command").some((c) => c.id === "late.go")).toBe(false);
    expect(cleanedUp).toBe(1);
    expect(notified).toBe(1);
    expect(host.app.plugins!.list().find((p) => p.id === "late")?.error).toBe(
      "Chunk failed to load",
    );
    // An essential plugin says so.
    expect(host.toasts.get().at(-1)).toMatchObject({
      title: "Late could not start",
      kind: "error",
    });
  });

  test("a second plugin with an id already taken is not started", async () => {
    hush();
    let started = 0;
    const one = definePlugin({ id: "twin", name: "One", activate: () => void started++ });
    const two = definePlugin({ id: "twin", name: "Two", activate: () => void started++ });
    const { host } = await setup([one, two]);
    expect(started).toBe(1);
    expect(host.pluginErrors.get().map((e) => e.error.message)).toEqual([
      "Another plugin already has the id twin",
    ]);
  });

  test("a contribution id already registered, or a command not named after its plugin, is refused", async () => {
    hush();
    const first = definePlugin({
      id: "first",
      name: "First",
      activate(ctx) {
        ctx.overlays.register({ id: "picker", component: () => null });
      },
    });
    const second = definePlugin({
      id: "second",
      name: "Second",
      activate(ctx) {
        const off = ctx.overlays.register({ id: "picker", component: () => <p>second</p> });
        off();
        ctx.commands.register({ id: "first.steal", title: "Steal", run() {} });
        ctx.commands.register({ id: "second.ok", title: "Fine", run() {} });
      },
    });
    const { host } = await setup([first, second]);
    expect(host.contributions.list("overlay").map((o) => o.pluginId)).toEqual(["first"]);
    expect(host.contributions.list("command").map((c) => c.id)).toContain("second.ok");
    expect(host.contributions.list("command").map((c) => c.id)).not.toContain("first.steal");
    expect(host.pluginErrors.get().map((e) => `${e.pluginId}: ${e.error.message}`)).toEqual([
      "second: Its overlay picker is already registered by first",
      "second: Command first.steal is not named after its plugin (second.…)",
    ]);
  });
});

describe("contributions that crash where they render", () => {
  test("a crashing page slot is contained; the slots beside it stay mounted", async () => {
    hush();
    const mounts = { calm: 0, body: 0 };
    function Calm() {
      useEffect(() => void mounts.calm++, []);
      return <p>Calm header</p>;
    }
    function Crash(): never {
      throw new Error("Slot broke");
    }
    function Editor() {
      useEffect(() => void mounts.body++, []);
      return <p>Editor</p>;
    }
    function Page({ tab }: ViewProps) {
      return (
        <div>
          <DocumentSlots slot="header" docId={tab.path} />
          <DocumentSlots slot="body" docId={tab.path} fallback={<Editor />} />
        </div>
      );
    }
    const slots = definePlugin({
      id: "slots",
      name: "Slots",
      activate(ctx) {
        ctx.views.register({ path: "/d/:id", component: Page });
        ctx.documents.register({ id: "calm", slot: "header", component: Calm });
        ctx.documents.register({ id: "crash", slot: "header", component: Crash });
        ctx.documents.register({ id: "crash-body", slot: "body", component: Crash });
      },
    });
    const { host } = await setup([slots]);
    await act(async () => host.app.open(docPath("01973200-0000-0000-0000-0000000000aa")));
    render(<LydieApp host={host} />);
    await screen.findByText("Calm header");
    expect(screen.getAllByText("Page slot (slots) failed")).toHaveLength(1);
    // A crashed body slot says so and shows the rest of the chain: the editor.
    expect(screen.getByText("Page (slots) failed")).toBeTruthy();
    expect(screen.getByText("Editor")).toBeTruthy();
    expect(mounts).toEqual({ calm: 1, body: 1 });
  });

  test("ContributionBoundary without a host scope still contains a crash", async () => {
    hush();
    function Crash(): never {
      throw new Error("Nope");
    }
    render(
      <div>
        <ContributionBoundary pluginId="x" label="Thing" fallback={<p>Fallback</p>}>
          <Crash />
        </ContributionBoundary>
        <p>Sibling</p>
      </div>,
    );
    expect(screen.getByText("Fallback")).toBeTruthy();
    expect(screen.getByText("Sibling")).toBeTruthy();
  });
});
