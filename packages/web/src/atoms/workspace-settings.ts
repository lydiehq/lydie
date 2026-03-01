import { getDefaultModel } from "@lydie/core/ai/models";
import type { WritableAtom } from "jotai";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import type { FontSizeOption } from "@/atoms/font-size";

type SidebarSection = "favorites" | "documents" | "collections";

type WorkspaceSettings = {
  sidebar: {
    isCollapsed: boolean;
    expandedSections: Record<SidebarSection, boolean>;
  };
  assistant: {
    isSidebarOpen: boolean;
    selectedAgentId: string | null;
    selectedModelId: string | null;
    isFloatingDocked: boolean;
    isFloatingOpen: boolean;
  };
  editor: {
    fontSize: FontSizeOption;
  };
};

const DEFAULT_SETTINGS: WorkspaceSettings = {
  sidebar: {
    isCollapsed: false,
    expandedSections: {
      favorites: true,
      documents: true,
      collections: true,
    },
  },
  assistant: {
    isSidebarOpen: false,
    selectedAgentId: null,
    selectedModelId: getDefaultModel().id,
    isFloatingDocked: false,
    isFloatingOpen: false,
  },
  editor: {
    fontSize: "default",
  },
};

const STORAGE_KEY = "lydie-workspace-settings";

const workspaceSettingsAtom = atomWithStorage<WorkspaceSettings>(STORAGE_KEY, DEFAULT_SETTINGS);

// Creates a derived atom that only subscribes to a specific path in the settings.
function createSettingAtom<Path extends keyof WorkspaceSettings>(
  path: Path,
): WritableAtom<WorkspaceSettings[Path], [WorkspaceSettings[Path]], void> {
  return atom(
    (get) => get(workspaceSettingsAtom)[path],
    (get, set, value) => {
      const current = get(workspaceSettingsAtom);
      set(workspaceSettingsAtom, {
        ...current,
        [path]: value,
      });
    },
  );
}

function createNestedSettingAtom<
  Path extends keyof WorkspaceSettings,
  SubPath extends keyof WorkspaceSettings[Path],
>(
  path: Path,
  subPath: SubPath,
): WritableAtom<WorkspaceSettings[Path][SubPath], [WorkspaceSettings[Path][SubPath]], void> {
  return atom(
    (get) => get(workspaceSettingsAtom)[path][subPath],
    (get, set, value) => {
      const current = get(workspaceSettingsAtom);
      set(workspaceSettingsAtom, {
        ...current,
        [path]: {
          ...current[path],
          [subPath]: value,
        },
      });
    },
  );
}

function createSidebarSectionAtom(section: SidebarSection): WritableAtom<boolean, [boolean], void> {
  return atom(
    (get) => get(workspaceSettingsAtom).sidebar.expandedSections[section] ?? true,
    (get, set, value) => {
      const current = get(workspaceSettingsAtom);
      set(workspaceSettingsAtom, {
        ...current,
        sidebar: {
          ...current.sidebar,
          expandedSections: {
            ...current.sidebar.expandedSections,
            [section]: value,
          },
        },
      });
    },
  );
}

// Sidebar settings
export const sidebarSettingsAtom = createSettingAtom("sidebar");
export const isSidebarCollapsedAtom = createNestedSettingAtom("sidebar", "isCollapsed");
export const sidebarExpandedSectionsAtom = createNestedSettingAtom("sidebar", "expandedSections");
export const isFavoritesExpandedAtom = createSidebarSectionAtom("favorites");
export const isDocumentsExpandedAtom = createSidebarSectionAtom("documents");
export const isCollectionsExpandedAtom = createSidebarSectionAtom("collections");

// Assistant settings
export const assistantSettingsAtom = createSettingAtom("assistant");
export const isAssistantSidebarOpenAtom = createNestedSettingAtom("assistant", "isSidebarOpen");
export const selectedAgentIdAtom = createNestedSettingAtom("assistant", "selectedAgentId");
export const selectedModelIdAtom = createNestedSettingAtom("assistant", "selectedModelId");
export const isFloatingAssistantDockedAtom = createNestedSettingAtom(
  "assistant",
  "isFloatingDocked",
);
export const isFloatingAssistantOpenAtom = createNestedSettingAtom("assistant", "isFloatingOpen");

// Editor settings
export const editorSettingsAtom = createSettingAtom("editor");
export const editorFontSizeAtom = createNestedSettingAtom("editor", "fontSize");
