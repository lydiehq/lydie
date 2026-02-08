import { atomWithStorage } from "jotai/utils";

// Persisted atom for assistant conversations sidebar state
// false = collapsed (default), true = open
export const isAssistantSidebarOpenAtom = atomWithStorage<boolean>(
  "lydie-assistant-sidebar-open",
  false, // collapsed by default
);
