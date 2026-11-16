// The address bar against a real host (SQLite through the Node driver) and a history in memory.
import { afterEach, describe, expect, test } from "bun:test";

import { createTestPlatform } from "@lydie/platform/testing";
import { definePlugin, docPath } from "@lydie/plugin-api";
import type { OverlayDef } from "@lydie/plugin-api";
import { createRuntime } from "@lydie/runtime";
import { openNodeStore } from "@lydie/store/node";

import { createEventHub, createLocalBackend } from "../backend/local.ts";
import { handledOperations } from "../backend/registry.ts";
import { startApp } from "../start.ts";
import { createMemoryStorage } from "./stores.ts";
import { syncUrl } from "./url-sync.ts";
import type { UrlHistory } from "./url-sync.ts";

const WS = "01973200-0000-0000-0000-000000000000";
const closers: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const fn of closers.splice(0).reverse()) await fn();
});

// A browser's session history: entries, a position, and popstate on traversal only.
function createHistory(start = "/", state: unknown = null) {
  const entries: { state: unknown; url: string }[] = [{ state, url: start }];
  let at = 0;
  const listeners = new Set<(state: unknown) => void>();
  const go = (delta: number) => {
    if (!entries[at + delta]) return;
    at += delta;
    for (const listener of [...listeners]) listener(entries[at]!.state);
  };
  const history: UrlHistory = {
    location() {
      const { pathname, search, hash } = new URL(entries[at]!.url, "http://lydie.test");
      return { pathname, search, hash };
    },
    state: () => entries[at]!.state,
    push(state, url) {
      entries.splice(at + 1);
      entries.push({ state, url });
      at += 1;
    },
    replace(state, url) {
      entries[at] = { state, url };
    },
    go,
    onPop(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    history,
    url: () => entries[at]!.url,
    urls: () => entries.map((e) => e.url),
    position: () => at,
    back: () => go(-1),
    forward: () => go(1),
  };
}

async function until(predicate: () => boolean, ms = 3000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > ms) throw new Error("Timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const settingsOverlay: OverlayDef = {
  id: "settings",
  component: () => null,
  url: {
    path: (props) =>
      `settings/${(props as { page?: string } | null)?.page ?? ""}`.replace(/\/$/, ""),
    parse: (path) => {
      const match = /^settings(?:\/([^/]+))?$/.exec(path);
      return match ? { page: match[1] ?? null } : null;
    },
  },
};

async function setup(options: { overlays?: boolean; slug?: string } = {}) {
  const tmp = (process.env.TMPDIR ?? "/tmp").replace(/\/$/, "");
  const path = `${tmp}/lydie-url-${crypto.randomUUID()}.sqlite`;
  const store = await openNodeStore({ path });
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
    info: {
      workspaceId: WS,
      workspaceName: "Test",
      persistent: true,
      ...(options.slug ? { workspaceSlug: options.slug } : {}),
    },
  });
  const plugin = definePlugin({
    id: "test-overlays",
    name: "Test overlays",
    activate(ctx) {
      for (const path of ["/d/:id", "/trash"]) ctx.views.register({ path, component: () => null });
      if (options.overlays !== false) ctx.overlays.register(settingsOverlay);
    },
  });
  const host = await startApp({
    backend,
    platform: createTestPlatform({ capabilities: { browserTab: true } }),
    plugins: [plugin],
    storage: createMemoryStorage(),
    layoutDebounceMs: 0,
  });
  const close = async () => {
    host.dispose();
    await host.layout.flush();
    await backend.close();
    await store.close();
  };
  closers.push(close);
  const ids: string[] = [];
  for (const title of ["One", "Two", "Three"]) {
    ids.push((await backend.ops.doc.create({ workspaceId: WS, title })).id);
  }
  // Titles arrive a moment after a page opens; the tests of the history leave them out.
  const start = (
    browser: ReturnType<typeof createHistory>,
    workspaceId?: string,
    titles = false,
  ) => {
    const stop = syncUrl(host, {
      base: "/",
      history: browser.history,
      titles,
      ...(workspaceId ? { workspaceId } : {}),
    });
    closers.push(stop);
    return stop;
  };
  const focused = () => host.app.activeTab();
  return { host, ids, start, focused };
}

describe("the address bar", () => {
  test("follows the focused tab: navigating adds an entry, moving focus does not", async () => {
    const { host, ids, start } = await setup();
    const [one, two, three] = ids as [string, string, string];
    const browser = createHistory();
    start(browser);
    // Nothing open: the base.
    expect(browser.urls()).toEqual(["/"]);

    host.app.openDoc(one);
    expect(browser.urls()).toEqual([`/d/${one}`]);
    host.app.openDoc(two);
    expect(browser.urls()).toEqual([`/d/${one}`, `/d/${two}`]);

    // A second tab, then back to the first: the same entry, rewritten.
    host.app.openDoc(three, { mode: "tab" });
    expect(browser.urls()).toEqual([`/d/${one}`, `/d/${three}`]);
    const first = host.getLayout().windows[0]!;
    const tabs = first.root.type === "group" ? first.root.tabs : [];
    host.dispatch({ type: "activate", tabId: tabs[0]!.id });
    expect(browser.urls()).toEqual([`/d/${one}`, `/d/${two}`]);

    // A heading in the same document is somewhere new.
    host.app.open(docPath(two, { heading: "Plan B" }));
    expect(browser.url()).toBe(`/d/${two}#Plan%20B`);
    expect(browser.urls()).toHaveLength(3);

    // Closing the tab leaves the other one's page in the bar.
    host.dispatch({ type: "close", tabId: tabs[0]!.id });
    expect(browser.url()).toBe(`/d/${three}`);
    expect(browser.urls()).toHaveLength(3);
  });

  test("Back and Forward move the tab through its own history", async () => {
    const { host, ids, start, focused } = await setup();
    const [one, two, three] = ids as [string, string, string];
    const browser = createHistory();
    start(browser);
    host.app.openDoc(one);
    const tabId = focused()!.id;
    host.dispatch({ type: "setTabState", tabId, state: { scrollTop: 40 } });
    host.app.openDoc(two);
    host.app.openDoc(three);

    browser.back();
    expect(focused()!.path).toBe(docPath(two));
    browser.back();
    expect(focused()!.path).toBe(docPath(one));
    // The tab's own back, so its state came with it.
    expect(host.layout.getTab(tabId)).toMatchObject({ state: { scrollTop: 40 }, back: [] });
    expect(host.layout.getTab(tabId)!.forward).toHaveLength(2);
    expect(browser.urls()).toEqual([`/d/${one}`, `/d/${two}`, `/d/${three}`]);

    browser.forward();
    expect(focused()!.path).toBe(docPath(two));
    // Navigating from the middle drops what was ahead, in both histories.
    host.app.openDoc(one);
    expect(browser.urls()).toEqual([`/d/${one}`, `/d/${two}`, `/d/${one}`]);
    expect(host.layout.getTab(tabId)!.forward).toEqual([]);
  });

  test("the app's own Back and Forward are the browser's", async () => {
    const { host, ids, start, focused } = await setup();
    const [one, two] = ids as [string, string];
    const browser = createHistory();
    start(browser);
    host.app.openDoc(one);
    host.app.openDoc(two);
    await host.app.runCommand("core.back");
    expect(focused()!.path).toBe(docPath(one));
    expect(browser.urls()).toEqual([`/d/${one}`, `/d/${two}`]);
    expect(browser.position()).toBe(0);
    await host.app.runCommand("core.forward");
    expect(browser.position()).toBe(1);
    expect(focused()!.path).toBe(docPath(two));

    // Also across tabs: Back is the entry before, whichever tab it belongs to.
    const first = focused()!.id;
    host.app.openDoc(one, { mode: "tab" });
    await host.app.runCommand("core.back");
    expect(focused()).toMatchObject({ id: first, path: docPath(one) });
    expect(browser.position()).toBe(0);
  });

  test("Back to another tab's page focuses that tab; a closed tab's page opens here", async () => {
    const { host, ids, start, focused } = await setup();
    const [one, two, three] = ids as [string, string, string];
    const browser = createHistory();
    start(browser);
    host.app.openDoc(one);
    const first = focused()!.id;
    host.app.openDoc(two);
    host.app.openDoc(three, { mode: "tab" });
    const second = focused()!.id;

    browser.back();
    expect(focused()).toMatchObject({ id: first, path: docPath(one) });
    browser.forward();
    expect(focused()).toMatchObject({ id: second, path: docPath(three) });

    host.dispatch({ type: "close", tabId: first });
    browser.back();
    expect(focused()).toMatchObject({ id: second, path: docPath(one) });
    expect(browser.url()).toBe(`/d/${one}`);
  });

  test("a URL the page loads with wins over the saved layout", async () => {
    const { host, ids, start, focused } = await setup();
    const [one, two, three] = ids as [string, string, string];
    host.app.openDoc(one);
    host.app.openDoc(two, { mode: "tab" });

    // A tab already shows it: focus.
    let browser = createHistory(`/d/${one}?embed=1`);
    let stop = start(browser);
    expect(focused()!.path).toBe(docPath(one));
    expect(browser.urls()).toEqual([`/d/${one}?embed=1`]);
    stop();

    // None does: a new tab, and the others stay.
    browser = createHistory(`/d/${three}`);
    stop = start(browser);
    expect(focused()!.path).toBe(docPath(three));
    const root = host.getLayout().windows[0]!.root;
    expect(root.type === "group" && root.tabs.map((t) => t.path)).toEqual([
      docPath(one),
      docPath(three),
      docPath(two),
    ]);
    stop();

    // A reload whose layout was saved before the tab got to the page: that tab goes there.
    const tabId = focused()!.id;
    browser = createHistory(`/d/${two}`, { lydie: { tab: tabId } });
    stop = start(browser);
    expect(focused()).toMatchObject({ id: tabId, path: docPath(two) });
    expect(host.layout.getTab(tabId)!.back.at(-1)?.path).toBe(docPath(three));
    stop();

    // The base: the focused tab's page goes into the bar, the query stays.
    browser = createHistory("/?seed=large");
    start(browser);
    expect(browser.urls()).toEqual([`/d/${two}?seed=large`]);
  });

  test("an overlay with a URL is an entry over the page: Back closes it", async () => {
    const { host, ids, start } = await setup();
    const [one] = ids as [string];
    const browser = createHistory();
    start(browser);
    host.app.openDoc(one);

    host.app.overlays.open("settings", null);
    expect(browser.urls()).toEqual([`/d/${one}`, "/settings"]);
    host.app.overlays.open("settings", { page: "general" });
    host.app.overlays.open("settings", { page: "about" });
    expect(browser.urls()).toEqual([`/d/${one}`, "/settings/about"]);

    // Closing it in the app goes back, leaving it one step forward.
    host.app.overlays.close("settings");
    expect(browser.position()).toBe(0);
    expect(browser.url()).toBe(`/d/${one}`);
    browser.forward();
    expect(host.overlay.get()).toEqual({ id: "settings", props: { page: "about" } });
    browser.back();
    expect(host.overlay.get()).toBeNull();

    // The palette has no URL.
    await host.app.runCommand("core.palette");
    expect(browser.url()).toBe(`/d/${one}`);
  });

  test("a deep link to an overlay opens it, also when its plugin loads later", async () => {
    const { host, ids, start } = await setup({ overlays: false });
    const [one] = ids as [string];
    host.app.openDoc(one);
    const browser = createHistory("/settings/about");
    start(browser);
    // Nothing claims the path yet: it stays.
    expect(host.overlay.get()).toBeNull();
    expect(browser.url()).toBe("/settings/about");

    closers.push(host.contributions.add("overlay", "late", settingsOverlay));
    expect(host.overlay.get()).toEqual({ id: "settings", props: { page: "about" } });
    // There is no page under it in the history: closing rewrites the entry.
    host.app.overlays.close("settings");
    expect(browser.urls()).toEqual([`/d/${one}`]);
  });

  test("a hosted workspace's URLs name it; another workspace's link is not opened", async () => {
    const { host, ids, start, focused } = await setup();
    const [one, two] = ids as [string, string];
    host.app.openDoc(one);
    let browser = createHistory(`/w/${WS}/d/${two}`);
    let stop = start(browser, WS);
    expect(focused()!.path).toBe(docPath(two));
    host.app.open("/trash");
    expect(browser.url()).toBe(`/w/${WS}/trash`);
    stop();

    browser = createHistory(`/w/01973294-a529-4a52-94a5-294a5294a529/d/${one}`);
    stop = start(browser, WS);
    expect(focused()!.path).toBe("/trash");
    expect(browser.url()).toBe(`/w/${WS}/trash`);

    // Overlays too: the settings of this workspace.
    host.app.overlays.open("settings", { page: "members" });
    expect(browser.url()).toBe(`/w/${WS}/settings/members`);
    browser.back();
    expect(host.overlay.get()).toBeNull();
    stop();
    browser = createHistory(`/w/${WS}/settings/about`);
    start(browser, WS);
    expect(host.overlay.get()).toEqual({ id: "settings", props: { page: "about" } });
  });

  test("a document's URL carries its title, and the workspace its slug", async () => {
    const { host, ids, start, focused } = await setup({ slug: "acme" });
    const [one, two] = ids as [string, string];
    const hex = (id: string) => id.replaceAll("-", "");
    const browser = createHistory();
    start(browser, WS, true);
    host.app.openDoc(one);
    await until(() => browser.url() === `/w/acme/d/one-${hex(one)}`);
    // The title arriving rewrote the entry; it did not add one.
    expect(browser.urls()).toHaveLength(1);

    await host.backend.ops.doc.rename({ id: one, title: "First things" });
    await until(() => browser.url() === `/w/acme/d/first-things-${hex(one)}`);

    // A link with an older title, or the workspace's id, is the same page.
    host.app.openDoc(two);
    await until(() => browser.url() === `/w/acme/d/two-${hex(two)}`);
    browser.back();
    expect(focused()!.path).toBe(docPath(one));
    const stale = createHistory(`/w/${WS}/d/an-old-title-${hex(two)}`);
    start(stale, WS, true);
    expect(focused()!.path).toBe(docPath(two));
    await until(() => stale.url() === `/w/acme/d/two-${hex(two)}`);
  });

  test("links to pages get the address bar's URLs, and the browser their modified clicks", async () => {
    const { host, ids } = await setup({ slug: "acme" });
    const [one] = ids as [string];
    const hex = one.replaceAll("-", "");
    // Without the address bar (the desktop app, an embed) links are the app's.
    expect(host.app.linkClicks).toBe("app");
    expect(host.app.href(docPath(one), "One")).toBe(docPath(one));

    const stop = syncUrl(host, {
      base: "/app/",
      history: createHistory("/app/").history,
      workspaceId: WS,
    });
    expect(host.app.linkClicks).toBe("browser");
    expect(host.app.href(docPath(one), "One")).toBe(`/app/w/acme/d/one-${hex}`);
    expect(host.app.href(docPath(one, { heading: "Plan" }))).toBe(`/app/w/acme/d/${one}#Plan`);
    expect(host.app.href("/trash")).toBe("/app/w/acme/trash");
    stop();
    expect(host.app.linkClicks).toBe("app");
  });
});
