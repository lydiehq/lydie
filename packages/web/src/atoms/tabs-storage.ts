import { atomWithStorage } from "jotai/utils";

import type { DocumentTab } from "./tabs";

const STORAGE_KEY = "lydie-document-tabs";

const DEFAULT_TABS: DocumentTab[] = [];
const DEFAULT_ACTIVE_TAB_ID: string | null = null;

export const storedDocumentTabsAtom = atomWithStorage<DocumentTab[]>(STORAGE_KEY, DEFAULT_TABS);
export const storedActiveTabIdAtom = atomWithStorage<string | null>(
  `${STORAGE_KEY}-active`,
  DEFAULT_ACTIVE_TAB_ID,
);
