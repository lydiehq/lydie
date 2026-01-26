import { Dismiss16Regular } from "@fluentui/react-icons";
import { useNavigate, useParams } from "@tanstack/react-router";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { Menu, MenuItem, MenuTrigger, Popover } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";
import { useOrganizationTabs } from "@/hooks/use-tabs";

export function TabBar() {
  const { id: currentDocId, organizationSlug } = useParams({ strict: false });
  const { tabs, setTabs, activeTabId, setActiveTabId } = useOrganizationTabs();
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [contextMenuTab, setContextMenuTab] = useState<string | null>(null);

  const handleSwitchTab = (tabId: string) => {
    setActiveTabId(tabId);
    navigate({
      to: "/w/$organizationSlug/$id",
      params: { organizationSlug: organization.slug, id: tabId },
    });
  };

  const handleCloseTab = (e: React.MouseEvent | null, tabId: string) => {
    e?.stopPropagation();

    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);

    // If closing the active tab, switch to an adjacent tab
    if (tabId === activeTabId && newTabs.length > 0) {
      const nextTab = newTabs[tabIndex] || newTabs[tabIndex - 1];
      if (nextTab) {
        handleSwitchTab(nextTab.id);
      }
    }
  };

  const handleCloseOtherTabs = (tabId: string) => {
    setTabs(tabs.filter((t) => t.id === tabId));
    handleSwitchTab(tabId);
  };

  const handleCloseTabsToRight = (tabId: string) => {
    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    setTabs(tabs.slice(0, tabIndex + 1));
  };

  const handleCloseAllTabs = () => {
    setTabs([]);
    setActiveTabId(null);
  };

  const handleMiddleClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      // Middle mouse button
      handleCloseTab(e, tabId);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + W to close active tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (activeTabId) {
          handleCloseTab(null, activeTabId);
        }
      }

      // Cmd/Ctrl + Tab to switch to next tab
      if ((e.metaKey || e.ctrlKey) && e.key === "Tab") {
        e.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        const nextIndex = e.shiftKey
          ? currentIndex - 1 < 0
            ? tabs.length - 1
            : currentIndex - 1
          : (currentIndex + 1) % tabs.length;
        if (tabs[nextIndex]) {
          handleSwitchTab(tabs[nextIndex].id);
        }
      }

      // Cmd/Ctrl + 1-9 to switch to specific tab
      if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        if (tabs[index]) {
          handleSwitchTab(tabs[index].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tabs, activeTabId, handleSwitchTab]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTab(tabId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    if (!draggedTab || draggedTab === targetTabId) return;

    const draggedIndex = tabs.findIndex((t) => t.id === draggedTab);
    const targetIndex = tabs.findIndex((t) => t.id === targetTabId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newTabs = [...tabs];
    const [removed] = newTabs.splice(draggedIndex, 1);
    newTabs.splice(targetIndex, 0, removed);

    setTabs(newTabs);
  };

  const handleDragEnd = () => {
    setDraggedTab(null);
  };

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 scrollbar-thin">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId || tab.id === currentDocId;
        return (
          <MenuTrigger key={tab.id}>
            <button
              draggable
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragEnd={handleDragEnd}
              onClick={() => handleSwitchTab(tab.id)}
              onMouseDown={(e) => handleMiddleClick(e, tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuTab(tab.id);
              }}
              className={clsx(
                "group flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                "border-b-2 -mb-px min-w-[100px] max-w-[200px]",
                isActive
                  ? "border-blue-500 bg-white text-gray-900"
                  : "border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                draggedTab === tab.id && "opacity-50",
              )}
            >
              <span className="truncate flex-1 text-left">{tab.title}</span>
              <button
                onClick={(e) => handleCloseTab(e, tab.id)}
                className={clsx(
                  "rounded p-0.5 transition-colors",
                  "hover:bg-gray-200 active:bg-gray-300",
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
                aria-label={`Close ${tab.title}`}
              >
                <Dismiss16Regular className="w-4 h-4" />
              </button>
            </button>
            <Popover placement="bottom start">
              <Menu className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] outline-none">
                <MenuItem
                  onAction={() => handleCloseTab(null, tab.id)}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                >
                  Close
                </MenuItem>
                <MenuItem
                  onAction={() => handleCloseOtherTabs(tab.id)}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                >
                  Close Other Tabs
                </MenuItem>
                <MenuItem
                  onAction={() => handleCloseTabsToRight(tab.id)}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                  isDisabled={index === tabs.length - 1}
                >
                  Close Tabs to Right
                </MenuItem>
                <MenuItem
                  onAction={handleCloseAllTabs}
                  className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer outline-none"
                >
                  Close All Tabs
                </MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        );
      })}
    </div>
  );
}
