import { Dismiss12Filled } from "@fluentui/react-icons";
import { sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { DocumentThumbnailIcon } from "@lydie/ui/components/icons/DocumentThumbnailIcon";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { Button, Tab, TabList, Tabs, TabPanels, type Key } from "react-aria-components";

import {
  activateDocumentTabAtom,
  closeDocumentTabAtom,
  documentTabsAtom,
  activeTabIdAtom,
  openDocumentTabAtom,
  updateTabTitleAtom,
} from "@/atoms/tabs";

interface DocumentTabBarProps {
  organizationSlug: string;
}

export function DocumentTabBar({ organizationSlug }: DocumentTabBarProps) {
  const tabs = useAtomValue(documentTabsAtom);
  const activeTabId = useAtomValue(activeTabIdAtom);
  const setActiveTab = useSetAtom(activateDocumentTabAtom);
  const closeTab = useSetAtom(closeDocumentTabAtom);

  const navigate = useNavigate();

  const handleSelectionChange = useCallback(
    (key: Key) => {
      const documentId = key as string;
      setActiveTab(documentId);
      navigate({
        to: "/w/$organizationSlug/$id",
        params: {
          organizationSlug,
          id: documentId,
        },
      });
    },
    [navigate, organizationSlug, setActiveTab],
  );

  const handleClose = useCallback(
    (documentId: string) => {
      const nextActiveId = closeTab(documentId);

      if (nextActiveId) {
        navigate({
          to: "/w/$organizationSlug/$id",
          params: {
            organizationSlug,
            id: nextActiveId,
          },
        });
      } else {
        navigate({
          to: "/w/$organizationSlug",
          params: { organizationSlug },
        });
      }
    },
    [navigate, organizationSlug, closeTab],
  );

  if (tabs.length === 0) return null;

  const selectedKey = activeTabId ?? tabs[0]?.documentId;

  return (
    <div className="flex items-center pt-1.5">
      <Tabs selectedKey={selectedKey} onSelectionChange={handleSelectionChange} className="flex-1">
        <TabList
          aria-label="Open documents"
          className="flex gap-px overflow-x-auto scrollbar-hide"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.documentId}
              id={tab.documentId}
              className={(renderProps) =>
                `group flex items-center gap-2 px-2 h-[28px] py-1.5 min-w-[120px] max-w-[200px] rounded-lg select-none transition-colors duration-150 ${
                  renderProps.isSelected
                    ? "bg-black/5"
                    : "bg-gray-50 text-gray-600 hover:bg-black/3"
                } ${tab.isPreview ? "italic" : ""}`
              }
            >
              <DocumentThumbnailIcon className="size-4 shrink-0" />
              <span className="flex-1 truncate text-sm font-medium text-gray-700">
                {tab.title || "Untitled"}
              </span>
              {tab.isDirty && <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />}
              <Button
                onPress={() => handleClose(tab.documentId)}
                aria-label={`Close ${tab.title || "Untitled"}`}
                className="opacity-0 group-hover:opacity-100 group-selected:opacity-100 p-0.5 text-black hover:bg-black/5 hover:text-black/60 rounded-md flex items-center justify-center pressed:bg-black/8 transition-opacity"
              >
                <Dismiss12Filled className={sidebarItemIconStyles({ className: "size-3" })} />
              </Button>
            </Tab>
          ))}
        </TabList>
        <TabPanels className="hidden" />
      </Tabs>
    </div>
  );
}

/**
 * Hook to sync the current document with the tab bar.
 * Call this from the document route component.
 */
export function useDocumentTabSync(documentId: string | undefined, title: string | undefined) {
  const openTab = useSetAtom(openDocumentTabAtom);
  const updateTitle = useSetAtom(updateTabTitleAtom);

  useEffect(() => {
    if (documentId && title) {
      openTab({ documentId, title });
    }
  }, [documentId, title, openTab]);

  useEffect(() => {
    if (documentId && title) {
      updateTitle({ documentId, title });
    }
  }, [documentId, title, updateTitle]);
}
