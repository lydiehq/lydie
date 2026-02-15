import { DismissRegular, DocumentRegular } from "@fluentui/react-icons";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "react-aria-components";

import {
  activateDocumentTabAtom,
  closeDocumentTabAtom,
  documentTabsAtom,
  openDocumentTabAtom,
  updateTabTitleAtom,
  type DocumentTab,
} from "@/atoms/tabs";

interface DocumentTabBarProps {
  organizationSlug: string;
}

export function DocumentTabBar({ organizationSlug }: DocumentTabBarProps) {
  const tabs = useAtomValue(documentTabsAtom);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center pt-1.5">
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto scrollbar-hide flex"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {tabs.map((tab) => (
          <TabItem key={tab.documentId} tab={tab} organizationSlug={organizationSlug} />
        ))}
      </div>
    </div>
  );
}

interface TabItemProps {
  tab: DocumentTab;
  organizationSlug: string;
}

function TabItem({ tab, organizationSlug }: TabItemProps) {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const closeTab = useSetAtom(closeDocumentTabAtom);
  const activateTab = useSetAtom(activateDocumentTabAtom);
  const isActive = params.id === tab.documentId;

  const handleClick = useCallback(() => {
    if (!isActive) {
      activateTab(tab.documentId);
      navigate({
        to: "/w/$organizationSlug/$id",
        params: {
          organizationSlug,
          id: tab.documentId,
        },
      });
    }
  }, [isActive, tab.documentId, organizationSlug, navigate, activateTab]);

  const handleClose = useCallback(() => {
    const nextActiveId = closeTab(tab.documentId);

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
  }, [tab.documentId, organizationSlug, navigate, closeTab]);

  return (
    <Button
      className={`
        group flex items-center gap-2 px-2 h-[32px] py-1.5 min-w-[120px] max-w-[200px] rounded-xl
        cursor-pointer select-none
        transition-colors duration-150
        ${isActive ? "bg-black/5" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}
        ${tab.isPreview ? "italic" : ""}
      `}
      onPress={handleClick}
    >
      <DocumentIcon className="size-4 shrink-0 icon-muted" />
      <span className="flex-1 truncate text-sm font-medium text-gray-700">
        {tab.title || "Untitled"}
      </span>
      {tab.isDirty && <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />}
      <Button
        onPress={handleClose}
        className={`
          opacity-0 group-hover:opacity-100
          ${isActive ? "opacity-100" : ""}
          p-0.5 rounded hover:bg-gray-200 transition-opacity
          focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
        `}
        aria-label={`Close ${tab.title || "Untitled"}`}
      >
        <DismissRegular className="size-3.5 text-gray-500" />
      </Button>
    </Button>
  );
}

/**
 * Hook to sync the current document with the tab bar.
 * Call this from the document route component.
 */
export function useDocumentTabSync(documentId: string | undefined, title: string | undefined) {
  const openTab = useSetAtom(openDocumentTabAtom);
  const updateTitle = useSetAtom(updateTabTitleAtom);

  // Open tab when document loads/changes
  useEffect(() => {
    if (documentId && title) {
      openTab({ documentId, title });
    }
  }, [documentId, title, openTab]);

  // Update tab title when it changes
  useEffect(() => {
    if (documentId && title) {
      updateTitle({ documentId, title });
    }
  }, [documentId, title, updateTitle]);
}
