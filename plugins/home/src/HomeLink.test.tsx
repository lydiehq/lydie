import { afterEach, expect, test } from "bun:test";

import { HOME_PATH, HostProvider } from "@lydie/plugin-api";
import type { HostBridge, TabInfo } from "@lydie/plugin-api";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { HomeLink } from "./HomeLink.tsx";

afterEach(cleanup);

function show(active: TabInfo | null) {
  const opened: unknown[] = [];
  const host = {
    app: {
      activeTab: () => active,
      subscribeActiveTab: () => () => {},
      open: (route: unknown, options: unknown) => opened.push([route, options]),
      modeFor: (g: { metaKey?: boolean }) => (g.metaKey ? "tab" : "replace"),
      keybindings: () => [],
      keymap: { subscribe: () => () => {} },
    },
    contributions: { list: () => [], subscribe: () => () => {} },
    tabs: { get: () => null, subscribe: () => () => {}, setState() {} },
  } as unknown as HostBridge;
  render(
    <HostProvider host={host}>
      <HomeLink />
    </HostProvider>,
  );
  return opened;
}

const tab = (path: string): TabInfo => ({
  id: "t1",
  groupId: "g1",
  path,
  isActive: true,
  isFocused: true,
});

test("opens the home page; current while the focused tab shows it", () => {
  const opened = show(tab("/d/01928000-0000-0000-0000-000000000000"));
  const link = screen.getByRole("button", { name: "Home" });
  expect(link.getAttribute("aria-current")).toBeNull();
  fireEvent.click(link);
  fireEvent.click(link, { metaKey: true });
  expect(opened).toEqual([
    [HOME_PATH, { mode: "replace" }],
    [HOME_PATH, { mode: "tab" }],
  ]);
});

test("marked current on the home page", () => {
  show(tab(HOME_PATH));
  expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
});
