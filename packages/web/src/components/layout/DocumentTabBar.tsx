import type { TooltipTriggerProps } from "react-aria";

import { Add12Filled, Dismiss12Filled } from "@fluentui/react-icons";
import { sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { Button } from "@lydie/ui/components/generic/Button";
import { DocumentThumbnailIcon } from "@lydie/ui/components/icons/DocumentThumbnailIcon";
import { useNavigate } from "@tanstack/react-router";
import { cva } from "cva";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import React from "react";
import { Tab, TabList, Tabs, type Key } from "react-aria-components";
import {
  Tooltip as AriaTooltip,
  type TooltipProps as AriaTooltipProps,
  TooltipTrigger as AriaTooltipTrigger,
  OverlayArrow,
  composeRenderProps,
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
import { useDocumentActions } from "@/hooks/use-document-actions";

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
        params: {
          organizationSlug,
          id: documentId,
        },
      });
    },
    [navigate, organizationSlug, setActiveTab],
  );

  const { createDocument } = useDocumentActions();

  if (tabs.length === 0) return null;

  const selectedKey = activeTabId ?? tabs[0]?.documentId;

  return (
    <div className="flex items-center pt-1.5 min-w-0 pr-6">
      <Tabs
        selectedKey={selectedKey}
        onSelectionChange={handleSelectionChange}
        className="flex min-w-0 flex-1 flex-row items-center overflow-x-auto scrollbar-hide"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <TabList aria-label="Open documents" className="flex shrink-0 gap-px">
          {tabs.map((tab) => (
            <TooltipTrigger key={tab.documentId} delay={500}>
              <Tab
                id={tab.documentId}
                onDoubleClick={() => handleDoubleClick(tab.documentId, tab.mode)}
                className={(renderProps) =>
                  `group relative flex w-[190px] min-w-[80px] shrink-0 items-center gap-2 px-2 h-[28px] py-1.5 rounded-lg select-none transition-colors duration-150 ${
                    renderProps.isSelected
                      ? "bg-black/5"
                      : "bg-gray-50 text-gray-600 hover:bg-black/3"
                  } ${tab.mode === "preview" ? "italic" : ""}`
                }
              >
                {(renderProps) => (
                  <>
                    <DocumentThumbnailIcon
                      className="size-4 shrink-0"
                      active={renderProps.isSelected}
                    />
                    <span className="flex-1 truncate text-sm font-medium text-gray-700 pr-5">
                      {tab.title || "Untitled"}
                    </span>
                    {tab.isDirty && <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />}
                    <button
                      type="button"
                      onClick={(e) => handleClose(e, tab.documentId)}
                      aria-label={`Close ${tab.title || "Untitled"}`}
                      className="absolute right-1 opacity-0 group-hover:opacity-100 group-selected:opacity-100 p-0.5 text-black hover:bg-black/5 hover:text-black/60 rounded-md flex items-center justify-center pressed:bg-black/8 transition-opacity"
                    >
                      <Dismiss12Filled className={sidebarItemIconStyles({ className: "size-3" })} />
                    </button>
                  </>
                )}
              </Tab>
              <Tooltip placement="bottom">{tab.title || "Untitled"}</Tooltip>
            </TooltipTrigger>
          ))}
        </TabList>
      </Tabs>
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

export interface TooltipProps extends Omit<AriaTooltipProps, "children"> {
  children: React.ReactNode;
  hotkeys?: string[];
}

const styles = cva({
  base: "group bg-black/85 text-white text-[12px] rounded-sm will-change-transform px-2 py-0.5",
  variants: {
    isEntering: {
      true: "animate-in fade-in placement-bottom:slide-in-from-top-1 placement-top:slide-in-from-bottom-1 placement-left:slide-in-from-right-1 placement-right:slide-in-from-left-1 ease-out duration-75",
    },
  },
});

export function Tooltip({ children, hotkeys, offset = 14, ...props }: TooltipProps) {
  return (
    <AriaTooltip
      {...props}
      offset={offset}
      className={composeRenderProps(props.className, (className, renderProps) =>
        styles({ ...renderProps, className }),
      )}
    >
      <OverlayArrow>
        <svg
          width={8}
          height={8}
          viewBox="0 0 8 8"
          className="fill-black/85 forced-colors:fill-[Canvas] group-placement-bottom:rotate-180 group-placement-left:-rotate-90 group-placement-right:rotate-90"
        >
          <path d="M0 0 L4 4 L8 0" />
        </svg>
      </OverlayArrow>
      <div className="flex items-center gap-2">
        <span>{children}</span>
        {hotkeys && hotkeys.length > 0 && (
          <div className="flex items-center gap-0.5">
            {hotkeys.map((key, index) => (
              <kbd
                key={index}
                className="px-1 text-[10px] font-medium text-white/80 border border-white/20 rounded"
              >
                {key}
              </kbd>
            ))}
          </div>
        )}
      </div>
    </AriaTooltip>
  );
}

export function TooltipTrigger({
  children,
  ...props
}: TooltipTriggerProps & { children: React.ReactNode }) {
  return (
    <AriaTooltipTrigger {...props} delay={props.delay || 200} closeDelay={props.closeDelay || 0}>
      {children}
    </AriaTooltipTrigger>
  );
}
