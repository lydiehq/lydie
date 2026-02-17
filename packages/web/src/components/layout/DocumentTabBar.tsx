import { Add12Filled, Dismiss12Filled } from "@fluentui/react-icons";
import { sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { Button } from "@lydie/ui/components/generic/Button";
import { Tooltip } from "@lydie/ui/components/generic/Tooltip";
import { DocumentThumbnailIcon } from "@lydie/ui/components/icons/DocumentThumbnailIcon";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import React from "react";
import {
  GridList,
  GridListItem,
  type Key,
  TooltipTrigger,
  Button as RACButton,
} from "react-aria-components";

import type { TabMode } from "@/atoms/tabs";
import {
  activateDocumentTabAtom,
  closeDocumentTabAtom,
  documentTabsAtom,
  activeTabIdAtom,
  makeTabPersistentAtom,
  syncDocumentTabAtom,
} from "@/atoms/tabs";
import { isSidebarCollapsedAtom } from "@/atoms/workspace-settings";
import { useDocumentActions } from "@/hooks/use-document-actions";
import { composeTailwindRenderProps, focusRing } from "@/utils/focus-ring";

import { SidebarIcon } from "./SidebarIcon";

interface DocumentTabBarProps {
  organizationSlug: string;
}

export function DocumentTabBar({ organizationSlug }: DocumentTabBarProps) {
  const tabs = useAtomValue(documentTabsAtom);
  const activeTabId = useAtomValue(activeTabIdAtom);
  const setActiveTab = useSetAtom(activateDocumentTabAtom);
  const closeTab = useSetAtom(closeDocumentTabAtom);
  const makePersistent = useSetAtom(makeTabPersistentAtom);

  const navigate = useNavigate();

  const handleClose = useCallback(
    (e: React.MouseEvent, documentId: string) => {
      e.stopPropagation();
      const nextActiveId = closeTab(documentId);

      if (nextActiveId) {
        navigate({
          to: "/w/$organizationSlug/$id",
          params: { organizationSlug, id: nextActiveId },
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

  const handleDoubleClick = useCallback(
    (documentId: string, mode: string | undefined) => {
      if (mode === "preview") {
        makePersistent(documentId);
      }
    },
    [makePersistent],
  );

  const handleSelectionChange = useCallback(
    (key: Key) => {
      const documentId = key as string;
      setActiveTab(documentId);
      navigate({
        to: "/w/$organizationSlug/$id",
        params: { organizationSlug, id: documentId },
      });
    },
    [navigate, organizationSlug, setActiveTab],
  );

  const { createDocument } = useDocumentActions();
  const isSidebarCollapsed = useAtomValue(isSidebarCollapsedAtom);

  if (tabs.length === 0) return null;

  const selectedKey = activeTabId ?? tabs[0]?.documentId;

  return (
    <div className="flex items-center pt-1.5 min-w-0 pr-6">
      {isSidebarCollapsed && (
        <TooltipTrigger delay={500}>
          <RACButton
            className={composeTailwindRenderProps(
              focusRing,
              "p-1 rounded hover:bg-black/5 text-gray-700 group mr-1",
            )}
            onPress={() => {
              // Dispatch custom event to toggle sidebar
              window.dispatchEvent(new CustomEvent("toggle-sidebar"));
            }}
            aria-label="Expand sidebar"
          >
            <SidebarIcon direction="left" collapsed={true} />
          </RACButton>
          <Tooltip>Expand sidebar</Tooltip>
        </TooltipTrigger>
      )}
      <GridList
        aria-label="Open documents"
        selectionMode="single"
        selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
        onSelectionChange={(keys) => {
          const key = [...keys][0];
          if (key) handleSelectionChange(key);
        }}
        className="flex min-w-0 flex-row items-center overflow-x-auto scrollbar-hide gap-px"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        items={tabs}
      >
        {(tab) => (
          <GridListItem
            key={tab.documentId}
            id={tab.documentId}
            textValue={tab.title || "Untitled"}
            className={({ isSelected }) =>
              `group relative flex w-[190px] min-w-[80px] shrink-0 items-center gap-1.5 px-2 h-[28px] py-1.5 rounded-lg select-none transition-colors duration-150 ${
                isSelected ? "bg-black/5" : "bg-gray-50 text-gray-600 hover:bg-black/3"
              } ${tab.mode === "preview" ? "italic" : ""}`
            }
            onAction={() => handleSelectionChange(tab.documentId)}
            onDoubleClick={() => handleDoubleClick(tab.documentId, tab.mode)}
          >
            {({ isSelected }) => (
              <>
                <DocumentThumbnailIcon className="size-4 shrink-0" active={isSelected} size="sm" />
                <span className="flex-1 truncate text-sm font-medium text-gray-700 pr-5">
                  {tab.title || "Untitled"}
                </span>
                {tab.isDirty && <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />}
                <button
                  type="button"
                  onClick={(e) => handleClose(e, tab.documentId)}
                  aria-label={`Close ${tab.title || "Untitled"}`}
                  className="absolute right-1 opacity-0 group-hover:opacity-100 group-selected:opacity-100 p-1 text-black hover:bg-black/5 hover:text-black/60 rounded-md flex items-center justify-center pressed:bg-black/8 transition-opacity"
                >
                  <Dismiss12Filled className={sidebarItemIconStyles({ className: "size-2.5" })} />
                </button>
              </>
            )}
          </GridListItem>
        )}
      </GridList>
      <Button
        intent="ghost"
        rounded
        size="icon-sm"
        onPress={() => createDocument()}
        className="shrink-0 ml-1"
        aria-label="New document"
      >
        <Add12Filled className={sidebarItemIconStyles({ className: "size-3" })} />
      </Button>
    </div>
  );
}

/**
 * Hook to sync the current document with the tab bar.
 * Call this from the document route component.
 * Returns a function to convert the current preview tab to persistent.
 */
export function useDocumentTabSync(
  documentId: string | undefined,
  title: string | undefined,
  mode: TabMode = "persistent",
) {
  const syncTab = useSetAtom(syncDocumentTabAtom);
  const makePersistent = useSetAtom(makeTabPersistentAtom);
  const syncedRef = useRef<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!documentId || !title) return;

    // Only sync if document ID or title actually changed
    const last = syncedRef.current;
    if (last?.id === documentId && last?.title === title) return;

    syncTab({ documentId, title, mode });
    syncedRef.current = { id: documentId, title };
  }, [documentId, title, mode, syncTab]);

  // Return function to convert current tab to persistent
  return useCallback(() => {
    if (documentId) {
      makePersistent(documentId);
    }
  }, [documentId, makePersistent]);
}
