import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type Tab = {
  id: string; // document ID
  title: string; // document title
  isPinned?: boolean; // pinned tabs
};

// Persist open tabs to localStorage per organization
// Note: We'll scope this by organization ID in the hooks layer
export const openTabsAtom = atomWithStorage<Tab[]>("lydie:openTabs", []);

export const activeTabIdAtom = atomWithStorage<string | null>(
  "lydie:activeTabId",
  null,
);

// Derived atom for active tab
export const activeTabAtom = atom((get) => {
  const tabs = get(openTabsAtom);
  const activeId = get(activeTabIdAtom);
  return tabs.find((tab) => tab.id === activeId) ?? null;
});
