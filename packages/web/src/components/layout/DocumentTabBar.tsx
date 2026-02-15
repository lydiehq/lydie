import { DismissRegular } from "@fluentui/react-icons";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  Tab,
  TabList,
  Tabs,
  TabPanels,
  type Key,
} from "react-aria-components";

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
      <Tabs
        selectedKey={selectedKey}
        onSelectionChange={handleSelectionChange}
        className="flex-1"
      >
        <TabList
          aria-label="Open documents"
          className="flex gap-1 overflow-x-auto scrollbar-hide"
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
                `group flex items-center gap-2 px-2 h-[32px] py-1.5 min-w-[120px] max-w-[200px] rounded-xl cursor-pointer select-none transition-colors duration-150 ${
                  renderProps.isSelected
                    ? "bg-black/5"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                } ${tab.isPreview ? "italic" : ""}`
              }
            >
              <DocumentIcon className="size-4 shrink-0 icon-muted" />
              <span className="flex-1 truncate text-sm font-medium text-gray-700">
                {tab.title || "Untitled"}
              </span>
              {tab.isDirty && (
                <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />
              )}
              <span
                onClick={() => handleClose(tab.documentId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    handleClose(tab.documentId);
                  }
                }}
                className="opacity-0 group-data-[selected]:opacity-100 p-0.5 rounded hover:bg-gray-200 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                role="button"
                tabIndex={0}
                aria-label={`Close ${tab.title || "Untitled"}`}
              >
                <DismissRegular className="size-3.5 text-gray-500" />
              </span>
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
export function useDocumentTabSync(
  documentId: string | undefined,
  title: string | undefined,
) {
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
